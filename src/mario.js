const SPRITE_SRC = '/mario-sprites.png'
const MUSHROOM_SRC = '/mushroom.png'

/**
 * Top row: 4 tiles, flush left. Bottom row: 3 tiles centered — applyCell() uses bottomInsetDisp.
 */
const SHEET = {
  idle: { col: 0, row: 0 },
  think: { col: 1, row: 0 },
  walk: { col: 3, row: 0 },
  jump: { col: 2, row: 0 },
}

/* footBottom = CSS bottom (px from viewport bottom to Mario’s feet); vy > 0 = moving up */
const GRAVITY = 3200
const JUMP_VELOCITY = 1050
const MOVE_SPEED = 280
const FLOOR_OFFSET = 10
const SPAWN_OFFSET_X = 52
const WALK_ANIM_MS = 220
const IDLE_ALT_MS = 1000
const MOVE_HINT_DELAY_MS = 7000
/** Max |footBottom| change per vertical substep so thin text lines aren’t tunnelled through */
const VERT_SUBSTEP_PX = 12
const MUSHROOM_GRAVITY = 3000
/** Initial pop-out horizontal speed (negative = left); boosted for farther arc */
const MUSHROOM_VX_AIR_MIN = 320
const MUSHROOM_VX_AIR_SPREAD = 200
/** After landing: slow slide clamped px/s left (negative magnitudes below) */
const MUSHROOM_SLIDE_MIN = -138
const MUSHROOM_SLIDE_MAX = -68
/** Ground friction multiplier per second toward rest (slow bleed, not abrupt stop) */
const MUSHROOM_GROUND_DRAG = 1.9
const MUSHROOM_W = 104
/** Visual + hitbox scale when Mario collects a mushroom */
const POWER_SCALE = 1.38
const POWER_DURATION_MS = 10000
/** Once per date element per session */
const bonkedDateRanges = new WeakSet()

function isTypingContext(target) {
  if (!target || !target.tagName) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function marioAabb(x, footBottom, hitboxW, hitboxH, viewH) {
  const feetY = viewH - footBottom
  return {
    left: x,
    right: x + hitboxW,
    top: feetY - hitboxH,
    bottom: feetY,
  }
}

function overlap1d(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1
}

function horizOverlapMarioSolid(x, hitboxW, s) {
  return x + hitboxW > s.left && x < s.right
}

function gatherSolids(marioRoot) {
  const solids = []
  const add = (r, el, kind) => {
    if (r.width < 2 || r.height < 2) return
    const b = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    if (kind && el) {
      b.kind = kind
      b.el = el
    }
    solids.push(b)
  }

  document.querySelectorAll('.intro, .section-nav').forEach((el) => {
    add(el.getBoundingClientRect())
  })
  document.querySelectorAll('#app .page-section:not(#experience)').forEach((el) => {
    if (el === marioRoot || el.contains?.(marioRoot)) return
    add(el.getBoundingClientRect())
  })
  document.querySelectorAll('#app .experience-item__range').forEach((el) => {
    if (el === marioRoot || el.contains?.(marioRoot)) return
    add(el.getBoundingClientRect(), el, 'date')
  })
  document
    .querySelectorAll(
      '#app .experience-item__title, #app .experience-item__location, #app .experience-item__bullets, #app .experience-item__tags > li',
    )
    .forEach((el) => {
      if (el === marioRoot || el.contains?.(marioRoot)) return
      add(el.getBoundingClientRect())
    })

  const icons = document.querySelector('.social-dock__icons')
  if (icons) add(icons.getBoundingClientRect())

  const contact = document.querySelector('#contact-open')
  if (contact) add(contact.getBoundingClientRect())

  return solids
}

function resolveHorizontal(x, prevX, footBottom, hitboxW, hitboxH, viewH, solids) {
  let nx = x
  const mTop = viewH - footBottom - hitboxH
  const mBottom = viewH - footBottom
  const dx = nx - prevX

  for (let pass = 0; pass < 4; pass++) {
    let moved = false
    const mLeft = nx
    const mRight = nx + hitboxW
    for (const s of solids) {
      if (!overlap1d(mTop, mBottom, s.top, s.bottom)) continue
      if (!overlap1d(mLeft, mRight, s.left, s.right)) continue
      if (dx > 0.01) {
        const push = s.left - hitboxW
        if (push < nx) {
          nx = push
          moved = true
        }
      } else if (dx < -0.01) {
        const push = s.right
        if (push > nx) {
          nx = push
          moved = true
        }
      } else {
        const penL = mRight - s.left
        const penR = s.right - mLeft
        if (penL < penR) {
          nx = s.left - hitboxW
        } else {
          nx = s.right
        }
        moved = true
      }
    }
    if (!moved) break
  }
  return nx
}

function resolveVertical(x, footBottom, vy, prevFootBottom, hitboxW, hitboxH, viewH, solids) {
  let fb = footBottom
  let v = vy
  let bonkInfo = null
  const m = marioAabb(x, fb, hitboxW, hitboxH, viewH)
  const prevM = marioAabb(x, prevFootBottom, hitboxW, hitboxH, viewH)

  const horizSolids = solids.filter((s) => horizOverlapMarioSolid(x, hitboxW, s))

  if (v <= 0) {
    const sorted = [...horizSolids].sort((a, b) => a.top - b.top)
    for (const s of sorted) {
      if (prevM.bottom <= s.top + 0.5 && m.bottom >= s.top - 4 && m.bottom <= s.bottom + hitboxH * 0.5) {
        fb = viewH - s.top
        v = 0
        break
      }
    }
  }

  if (v > 0) {
    const m2 = marioAabb(x, fb, hitboxW, hitboxH, viewH)
    const sorted = [...horizSolids].sort((a, b) => a.bottom - b.bottom)
    for (const s of sorted) {
      if (prevM.top >= s.bottom - 1 && m2.top <= s.bottom + 2) {
        fb = viewH - s.bottom - hitboxH
        v = 0
        if (s.kind === 'date' && s.el) {
          bonkInfo = {
            el: s.el,
            rect: { left: s.left, top: s.top, right: s.right, bottom: s.bottom },
          }
        }
        break
      }
    }
  }

  if (fb < FLOOR_OFFSET) {
    fb = FLOOR_OFFSET
    if (v < 0) v = 0
  }

  return [fb, v, bonkInfo]
}

function feetOnPlatformTop(x, hitboxW, footBottom, viewH, solids) {
  const feetY = viewH - footBottom
  const cx = x + hitboxW * 0.5
  for (const s of solids) {
    if (cx >= s.left && cx <= s.right && Math.abs(feetY - s.top) < 4) return true
  }
  return false
}

/** Mushroom uses fixed left/bottom (same convention as Mario); returns viewport AABB (y down). */
function mushroomViewportAabb(mu, viewH) {
  const w = mu.el.offsetWidth || MUSHROOM_W
  const h = mu.el.offsetHeight || MUSHROOM_W
  const left = mu.x
  const right = mu.x + w
  const bottomY = viewH - mu.bottom
  const topY = bottomY - h
  return { left, right, top: topY, bottom: bottomY }
}

function viewportAabbOverlap(a, b) {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

export function initMario() {
  const mushrooms = []
  let destroyed = false
  let rafId = 0
  let onKeyDown = null
  let onKeyUp = null
  let onResizeHandler = null

  const root = document.createElement('div')
  root.className = 'mario'
  root.setAttribute('aria-hidden', 'true')

  const sprite = document.createElement('div')
  sprite.className = 'mario__sprite'
  root.appendChild(sprite)

  const hint = document.createElement('div')
  hint.className = 'mario__hint'
  hint.innerHTML = `
    <span class="mario__hint-line">
      <span class="mario__keypad-row" aria-hidden="true">
        <span class="mario__keypad">
          <span class="mario__key mario__key--ghost"></span>
          <span class="mario__key">W</span>
          <span class="mario__key mario__key--ghost"></span>
          <span class="mario__key">A</span>
          <span class="mario__key">S</span>
          <span class="mario__key">D</span>
        </span>
        <span class="mario__hint-sep">or</span>
        <span class="mario__keypad">
          <span class="mario__key mario__key--ghost"></span>
          <span class="mario__key">↑</span>
          <span class="mario__key mario__key--ghost"></span>
          <span class="mario__key">←</span>
          <span class="mario__key">↓</span>
          <span class="mario__key">→</span>
        </span>
      </span>
    </span>
  `
  root.appendChild(hint)

  document.body.appendChild(root)

  function destroy() {
    if (destroyed) return
    destroyed = true
    cancelAnimationFrame(rafId)
    if (onKeyDown) window.removeEventListener('keydown', onKeyDown)
    if (onKeyUp) window.removeEventListener('keyup', onKeyUp)
    if (onResizeHandler) window.removeEventListener('resize', onResizeHandler)
    for (const m of mushrooms) {
      if (m.el?.isConnected) m.el.remove()
    }
    mushrooms.length = 0
    document.querySelectorAll('.mario-mushroom').forEach((el) => el.remove())
    if (root.isConnected) root.remove()
  }

  const img = new Image()
  img.decoding = 'async'
  img.src = SPRITE_SRC
  img.onerror = () => {
    if (!destroyed && root.isConnected) root.remove()
  }

  img.onload = () => {
    if (destroyed) {
      if (root.isConnected) root.remove()
      return
    }
    const nw = img.naturalWidth
    const nh = img.naturalHeight
    const cellW = nw / 4
    const cellH = nh / 2
    const targetCellH = Math.min(112, Math.max(72, window.innerHeight * 0.12))
    const scale = targetCellH / cellH

    const fw0 = Math.max(1, Math.round(cellW * scale))
    const fh0 = Math.max(1, Math.round(cellH * scale))
    const bottomInsetSrc = Math.max(0, (nw - 3 * cellW) / 2)
    const hitboxW0 = cellW * scale * 0.42
    const hitboxH0 = cellH * scale * 0.48

    let fw = fw0
    let fh = fh0
    let bgW = fw * 4
    let bgH = fh * 2
    let bottomInsetDisp = Math.round(bottomInsetSrc * (fw / cellW))
    let hitboxW = hitboxW0
    let hitboxHStand = hitboxH0
    let rootPadX = (fw - hitboxW) / 2
    let jumpVel = JUMP_VELOCITY
    let powered = false
    /** performance.now() when big Mario expires; refreshed by each mushroom pickup */
    let powerExpiresAt = 0

    function syncMetrics() {
      const m = powered ? POWER_SCALE : 1
      fw = Math.max(1, Math.round(fw0 * m))
      fh = Math.max(1, Math.round(fh0 * m))
      bgW = fw * 4
      bgH = fh * 2
      bottomInsetDisp = Math.round(bottomInsetSrc * (fw / cellW))
      hitboxW = hitboxW0 * m
      hitboxHStand = hitboxH0 * m
      rootPadX = (fw - hitboxW) / 2
      jumpVel = JUMP_VELOCITY * (powered ? 1.07 : 1)
      root.classList.toggle('mario--big', powered)
    }
    syncMetrics()

    const keys = new Set()
    let x = FLOOR_OFFSET + SPAWN_OFFSET_X
    let footBottom = FLOOR_OFFSET
    let vy = 0
    let facing = 1
    let lastTime = performance.now()
    let walkPhase = 0
    let walkTimer = 0
    let lastActivityAt = performance.now()
    const spawnAt = performance.now()
    let movedAtLeastOnce = false
    let moveHintVisible = false
    /** After IDLE_ALT_MS still, show thinking pose until moving again */
    let idleThink = false
    let wasGrounded = true

    const applyCell = ({ col, row }) => {
      const posX = (row === 1 ? bottomInsetDisp : 0) + col * fw
      const posY = row * fh
      sprite.style.backgroundSize = `${bgW}px ${bgH}px`
      sprite.style.width = `${fw}px`
      sprite.style.height = `${fh}px`
      sprite.style.backgroundPosition = `-${posX}px -${posY}px`
    }

    const setFacing = (dir) => {
      facing = dir
      sprite.classList.toggle('mario__sprite--left', dir < 0)
    }

    const tryJump = (groundedNow) => {
      if (!groundedNow) return
      vy = jumpVel
    }

    const controlCodes = new Set([
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'Space',
      'KeyA',
      'KeyD',
      'KeyW',
    ])

    onKeyDown = (e) => {
      if (isTypingContext(e.target)) return
      if (!controlCodes.has(e.code)) return
      e.preventDefault()
      if (e.repeat) {
        if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') return
      }
      keys.add(e.code)
      if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
        const H = window.innerHeight
        const solids = gatherSolids(root)
        const groundedNow =
          Math.abs(vy) < 2 &&
          (Math.abs(footBottom - FLOOR_OFFSET) < 2 ||
            feetOnPlatformTop(x, hitboxW, footBottom, H, solids))
        tryJump(groundedNow)
      }
    }

    onKeyUp = (e) => {
      if (!controlCodes.has(e.code)) return
      keys.delete(e.code)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    function triggerDateBonk(info, viewH) {
      const { el, rect } = info
      if (bonkedDateRanges.has(el)) return
      bonkedDateRanges.add(el)
      el.classList.add('experience-item__range--emptied')
      el.classList.remove('experience-item__range--bonk')
      void el.offsetWidth
      el.classList.add('experience-item__range--bonk')
      el.addEventListener(
        'animationend',
        () => el.classList.remove('experience-item__range--bonk'),
        { once: true },
      )

      const mushImg = document.createElement('img')
      mushImg.className = 'mario-mushroom'
      mushImg.src = MUSHROOM_SRC
      mushImg.alt = ''
      mushImg.setAttribute('aria-hidden', 'true')
      mushImg.decoding = 'async'
      mushImg.style.width = `${MUSHROOM_W}px`
      mushImg.style.height = 'auto'
      document.body.appendChild(mushImg)

      const cx = (rect.left + rect.right) * 0.5
      const spawnBottom = Math.max(FLOOR_OFFSET, viewH - rect.bottom + 6)
      mushrooms.push({
        el: mushImg,
        x: cx - MUSHROOM_W / 2,
        bottom: spawnBottom,
        vx: -(MUSHROOM_VX_AIR_MIN + Math.random() * MUSHROOM_VX_AIR_SPREAD),
        vy: 480 + Math.random() * 140,
        grounded: false,
      })
    }

    const loop = (now) => {
      if (destroyed) return
      const dt = Math.min(0.05, (now - lastTime) / 1000)
      lastTime = now
      const H = window.innerHeight

      if (powered && now >= powerExpiresAt) {
        powered = false
        powerExpiresAt = 0
        syncMetrics()
      }

      const hitboxH = hitboxHStand
      const solids = gatherSolids(root)

      let vx = 0
      if (keys.has('ArrowLeft') || keys.has('KeyA')) vx -= MOVE_SPEED
      if (keys.has('ArrowRight') || keys.has('KeyD')) vx += MOVE_SPEED

      if (vx < 0) setFacing(-1)
      if (vx > 0) setFacing(1)

      const inputHeld =
        keys.has('ArrowLeft') ||
        keys.has('KeyA') ||
        keys.has('ArrowRight') ||
        keys.has('KeyD')
      const moving = Math.abs(vx) > 1
      if (moving || inputHeld || Math.abs(vy) > 2) {
        lastActivityAt = now
        idleThink = false
      } else if (wasGrounded && now - lastActivityAt >= IDLE_ALT_MS) {
        idleThink = true
      }

      const prevX = x
      x += vx * dt
      x = resolveHorizontal(x, prevX, footBottom, hitboxW, hitboxH, H, solids)
      const movedHorizontally = Math.abs(x - prevX) > 0.15
      if (movedHorizontally) {
        movedAtLeastOnce = true
        moveHintVisible = false
      } else if (!movedAtLeastOnce && !moveHintVisible && now - spawnAt >= MOVE_HINT_DELAY_MS) {
        moveHintVisible = true
      }

      const minX = FLOOR_OFFSET
      const maxX = Math.max(minX, window.innerWidth - hitboxW - FLOOR_OFFSET)
      x = Math.min(maxX, Math.max(minX, x))

      const prevFb = footBottom
      vy -= GRAVITY * dt
      const delta = vy * dt
      const nSteps = Math.max(1, Math.ceil(Math.abs(delta) / VERT_SUBSTEP_PX))
      const step = delta / nSteps
      let lastFb = prevFb
      let bonkInfo = null
      for (let si = 0; si < nSteps; si++) {
        const stepPrev = lastFb
        lastFb += step
        const [nf, nv, bonk] = resolveVertical(x, lastFb, vy, stepPrev, hitboxW, hitboxH, H, solids)
        lastFb = nf
        vy = nv
        if (bonk && !bonkInfo) bonkInfo = bonk
        if (vy === 0) break
      }
      footBottom = lastFb
      if (bonkInfo) triggerDateBonk(bonkInfo, H)

      for (let i = mushrooms.length - 1; i >= 0; i--) {
        const mu = mushrooms[i]
        if (!mu.grounded) {
          mu.vy -= MUSHROOM_GRAVITY * dt
          mu.x += mu.vx * dt
          mu.bottom += mu.vy * dt
          if (mu.bottom <= FLOOR_OFFSET) {
            mu.bottom = FLOOR_OFFSET
            mu.vy = 0
            const airborne = mu.vx
            mu.vx = Math.max(MUSHROOM_SLIDE_MIN, Math.min(MUSHROOM_SLIDE_MAX, airborne * 0.45))
            mu.grounded = true
          }
        } else {
          mu.x += mu.vx * dt
          if (Math.abs(mu.vx) > 50) mu.vx *= Math.exp(-MUSHROOM_GROUND_DRAG * dt)
          else mu.vx *= Math.exp(-0.72 * dt)
        }
        const mw = mu.el.offsetWidth || MUSHROOM_W
        if (mu.x + mw < -100 || mu.x > window.innerWidth + 100) {
          mu.el.remove()
          mushrooms.splice(i, 1)
          continue
        }
        mu.el.style.left = `${mu.x}px`
        mu.el.style.bottom = `${mu.bottom}px`

        const marioRect = marioAabb(x, footBottom, hitboxW, hitboxHStand, H)
        if (viewportAabbOverlap(marioRect, mushroomViewportAabb(mu, H))) {
          mu.el.remove()
          mushrooms.splice(i, 1)
          powered = true
          powerExpiresAt = now + POWER_DURATION_MS
          syncMetrics()
        }
      }

      if (Math.abs(vy) < 2 && footBottom > FLOOR_OFFSET + 2 && !feetOnPlatformTop(x, hitboxW, footBottom, H, solids)) {
        vy = -40
      }

      const grounded =
        Math.abs(vy) < 2 &&
        (Math.abs(footBottom - FLOOR_OFFSET) < 2 || feetOnPlatformTop(x, hitboxW, footBottom, H, solids))
      wasGrounded = grounded

      let cell = SHEET.idle
      if (!grounded) {
        cell = SHEET.jump
      } else if (Math.abs(vx) > 0.01) {
        walkTimer += dt * 1000
        if (walkTimer >= WALK_ANIM_MS) {
          walkTimer = 0
          walkPhase = (walkPhase + 1) % 2
        }
        cell = walkPhase === 0 ? SHEET.walk : SHEET.idle
      } else {
        walkTimer = 0
        cell = idleThink ? SHEET.think : SHEET.idle
      }

      applyCell(cell)

      root.style.left = `${x - rootPadX}px`
      root.style.bottom = `${footBottom}px`
      root.style.width = `${fw}px`
      root.style.height = `${hitboxH}px`
      hint.classList.toggle('mario__hint--visible', moveHintVisible)

      rafId = requestAnimationFrame(loop)
    }

    onResizeHandler = () => {
      const H = window.innerHeight
      const solids = gatherSolids(root)
      const hitboxH = hitboxHStand
      const minX = FLOOR_OFFSET
      const maxX = Math.max(minX, window.innerWidth - hitboxW - FLOOR_OFFSET)
      x = resolveHorizontal(x, x, footBottom, hitboxW, hitboxH, H, solids)
      x = Math.min(maxX, Math.max(minX, x))
      ;[footBottom, vy] = resolveVertical(x, footBottom, vy, footBottom, hitboxW, hitboxH, H, solids).slice(0, 2)
      if (footBottom < FLOOR_OFFSET) footBottom = FLOOR_OFFSET
    }
    window.addEventListener('resize', onResizeHandler)

    applyCell(SHEET.idle)
    root.style.left = `${x - rootPadX}px`
    root.style.bottom = `${footBottom}px`
    root.style.width = `${fw}px`
    root.style.height = `${hitboxHStand}px`
    rafId = requestAnimationFrame(loop)
  }

  return destroy
}

