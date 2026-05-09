import './style.css'

const contactOpen = document.querySelector('#contact-open')
const contactDialog = document.querySelector('#contact-dialog')
const contactClose = document.querySelector('#contact-close')

if (contactOpen && contactDialog) {
  contactOpen.addEventListener('click', () => {
    contactDialog.showModal()
  })

  contactClose?.addEventListener('click', () => {
    contactDialog.close()
  })

  contactDialog.addEventListener('click', (e) => {
    if (e.target === contactDialog) {
      contactDialog.close()
    }
  })
}

const scrollHint = document.querySelector('#scroll-hint')
const hasScrolled = () => window.scrollY > 12
let scrollHintTimer = null

if (scrollHint) {
  const showHintIfStillTop = () => {
    if (!hasScrolled()) {
      scrollHint.classList.add('scroll-hint--visible')
    }
  }

  const hideHint = () => {
    scrollHint.classList.remove('scroll-hint--visible')
  }

  const scheduleHint = () => {
    if (scrollHintTimer) clearTimeout(scrollHintTimer)
    scrollHintTimer = setTimeout(showHintIfStillTop, 10000)
  }

  window.addEventListener(
    'scroll',
    () => {
      if (hasScrolled()) {
        hideHint()
        if (scrollHintTimer) {
          clearTimeout(scrollHintTimer)
          scrollHintTimer = null
        }
      }
    },
    { passive: true },
  )

  window.addEventListener('wheel', hideHint, { passive: true })
  window.addEventListener('touchstart', hideHint, { passive: true })
  window.addEventListener('keydown', hideHint)

  scheduleHint()
}

const sectionLinks = [...document.querySelectorAll('.section-nav__link[href^="#"]')]
const sections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean)
const resumeLink = document.querySelector('.section-nav__link[href="/JoshElieson_Resume.pdf"]')

let resumeClearTimer = null
let waitingForResumeReturn = false

function clearResumeHighlight() {
  if (!resumeLink) return
  resumeLink.classList.remove('section-nav__link--resume-active')
  if (resumeClearTimer) {
    clearTimeout(resumeClearTimer)
    resumeClearTimer = null
  }
  waitingForResumeReturn = false
  window.removeEventListener('click', clearResumeHighlight, true)
  window.removeEventListener('scroll', clearResumeHighlight, true)
  window.removeEventListener('keydown', clearResumeHighlight, true)
  window.removeEventListener('touchstart', clearResumeHighlight, true)
}

function armResumeDismiss() {
  if (!resumeLink) return
  window.addEventListener('click', clearResumeHighlight, true)
  window.addEventListener('scroll', clearResumeHighlight, true)
  window.addEventListener('keydown', clearResumeHighlight, true)
  window.addEventListener('touchstart', clearResumeHighlight, true)
  resumeClearTimer = setTimeout(clearResumeHighlight, 2000)
}

if (resumeLink) {
  resumeLink.addEventListener('click', () => {
    resumeLink.classList.add('section-nav__link--resume-active')
    if (resumeClearTimer) {
      clearTimeout(resumeClearTimer)
      resumeClearTimer = null
    }
    waitingForResumeReturn = true
  })

  const onResumeReturn = () => {
    if (!waitingForResumeReturn) return
    if (document.hidden) return
    armResumeDismiss()
  }

  document.addEventListener('visibilitychange', onResumeReturn)
  window.addEventListener('focus', onResumeReturn)
}

function setActiveSection(sectionId) {
  sectionLinks.forEach((link) => {
    const isActive = link.getAttribute('href') === `#${sectionId}`
    link.classList.toggle('section-nav__link--active', isActive)
  })
}

if (sections.length) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visibleSections = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

      if (visibleSections.length) {
        setActiveSection(visibleSections[0].target.id)
      }
    },
    {
      root: null,
      rootMargin: '-25% 0px -55% 0px',
      threshold: [0.15, 0.35, 0.6],
    },
  )

  sections.forEach((section) => observer.observe(section))
  setActiveSection(sections[0].id)
}

const canvas = document.querySelector('#tech-bg')
const ctx = canvas.getContext('2d')

const CELL = 26
const GLOW_RADIUS_CELLS = 13
const DRIFT_X_PX = 14
const DRIFT_Y_PX = 9

const pointer = {
  x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
}

function setPointer(clientX, clientY) {
  pointer.x = clientX
  pointer.y = clientY
}

window.addEventListener('mousemove', (e) => {
  setPointer(e.clientX, e.clientY)
})

window.addEventListener(
  'touchmove',
  (e) => {
    const t = e.touches[0]
    if (t) setPointer(t.clientX, t.clientY)
  },
  { passive: true },
)

window.addEventListener(
  'touchstart',
  (e) => {
    const t = e.touches[0]
    if (t) setPointer(t.clientX, t.clientY)
  },
  { passive: true },
)

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = window.innerWidth
  const h = window.innerHeight
  canvas.width = Math.floor(w * dpr)
  canvas.height = Math.floor(h * dpr)
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

window.addEventListener('resize', resize)
resize()

function drawGrid(nowMs) {
  const w = window.innerWidth
  const h = window.innerHeight
  const t = nowMs * 0.001

  const driftX = ((t * DRIFT_X_PX) % CELL + CELL) % CELL
  const driftY = ((t * DRIFT_Y_PX) % CELL + CELL) % CELL

  ctx.clearRect(0, 0, w, h)

  const originGx = Math.floor((pointer.x - driftX) / CELL)
  const originGy = Math.floor((pointer.y - driftY) / CELL)
  const R = Math.ceil(GLOW_RADIUS_CELLS) + 1

  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const gx = originGx + dx
      const gy = originGy + dy
      const px = gx * CELL + driftX
      const py = gy * CELL + driftY
      const cx = px + CELL * 0.5
      const cy = py + CELL * 0.5
      const distCells = Math.hypot(cx - pointer.x, cy - pointer.y) / CELL
      if (distCells > GLOW_RADIUS_CELLS) continue

      const falloff = 1 - distCells / GLOW_RADIUS_CELLS
      const a = falloff * falloff * 0.118
      ctx.fillStyle = `rgba(235, 98, 62, ${a})`
      ctx.fillRect(px, py, CELL + 1, CELL + 1)
    }
  }

  ctx.strokeStyle = 'rgba(58, 52, 46, 0.1)'
  ctx.lineWidth = 1
  ctx.shadowColor = 'rgba(32, 28, 24, 0.32)'
  ctx.shadowBlur = 0.9
  ctx.beginPath()
  for (let x = -CELL + driftX; x < w + CELL; x += CELL) {
    ctx.moveTo(Math.floor(x) + 0.5, 0)
    ctx.lineTo(Math.floor(x) + 0.5, h)
  }
  for (let y = -CELL + driftY; y < h + CELL; y += CELL) {
    ctx.moveTo(0, Math.floor(y) + 0.5)
    ctx.lineTo(w, Math.floor(y) + 0.5)
  }
  ctx.stroke()

  ctx.strokeStyle = 'rgba(70, 64, 58, 0.038)'
  ctx.shadowColor = 'rgba(42, 38, 34, 0.16)'
  ctx.shadowBlur = 0.65
  ctx.beginPath()
  const minor = CELL * 0.25
  const driftMx = ((t * DRIFT_X_PX * 0.35) % minor + minor) % minor
  const driftMy = ((t * DRIFT_Y_PX * 0.35) % minor + minor) % minor
  for (let x = -minor + driftMx; x < w + minor; x += minor) {
    ctx.moveTo(Math.floor(x) + 0.5, 0)
    ctx.lineTo(Math.floor(x) + 0.5, h)
  }
  for (let y = -minor + driftMy; y < h + minor; y += minor) {
    ctx.moveTo(0, Math.floor(y) + 0.5)
    ctx.lineTo(w, Math.floor(y) + 0.5)
  }
  ctx.stroke()

  ctx.shadowBlur = 0
  ctx.shadowColor = 'transparent'

  requestAnimationFrame(drawGrid)
}

requestAnimationFrame(drawGrid)
