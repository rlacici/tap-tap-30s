import { ASSETS } from './config'

let mouthBgReady: Promise<void> | null = null
let mouthBgResolved = false
let resolveMouthBg: (() => void) | null = null
let rejectMouthBg: ((err: Error) => void) | null = null

function markMouthBackgroundReady(): void {
  if (mouthBgResolved) return
  mouthBgResolved = true
  resolveMouthBg?.()
  resolveMouthBg = null
  rejectMouthBg = null
}

function failMouthBackground(err: Error): void {
  if (mouthBgResolved) return
  const reject = rejectMouthBg
  mouthBgReady = null
  resolveMouthBg = null
  rejectMouthBg = null
  reject?.(err)
}

/** Clear preload state so a failed mouth BG can be fetched again. */
export function resetMouthBackgroundPreload(): void {
  mouthBgReady = null
  mouthBgResolved = false
  resolveMouthBg = null
  rejectMouthBg = null
}

/** Kick off mouth BG fetch ASAP (safe to call multiple times). Rejects on failure. */
export function preloadMouthBackground(): Promise<void> {
  if (mouthBgReady) return mouthBgReady

  mouthBgReady = new Promise<void>((resolve, reject) => {
    resolveMouthBg = resolve
    rejectMouthBg = reject
    if (mouthBgResolved) {
      resolve()
      return
    }

    const img = new Image()
    img.decoding = 'async'
    const settle = (): void => {
      if (img.naturalWidth <= 0) {
        failMouthBackground(new Error('mouth background failed to load'))
        return
      }
      const decoded = img.decode?.()
      if (decoded) {
        decoded.then(markMouthBackgroundReady).catch(markMouthBackgroundReady)
      } else {
        markMouthBackgroundReady()
      }
    }
    img.onload = settle
    img.onerror = () => {
      failMouthBackground(new Error('mouth background failed to load'))
    }
    img.src = ASSETS.mouthBoard
    if (img.complete && img.naturalWidth > 0) settle()
  })

  return mouthBgReady
}

/** Resolves when the play-area mouth BG has loaded (and ideally decoded). */
export function whenMouthBackgroundReady(): Promise<void> {
  return preloadMouthBackground()
}

export function isMouthBackgroundReady(): boolean {
  return mouthBgResolved
}

/**
 * Play-area mouth: user background image fills under-HUD stage edge-to-edge.
 */
export function createMouthScene(): HTMLElement {
  void preloadMouthBackground()

  const scene = document.createElement('div')
  scene.className = 'mouth-scene'
  scene.setAttribute('aria-hidden', 'true')

  const board = document.createElement('div')
  board.className = 'mouth-board'
  board.dataset.mouthBoard = 'true'

  const img = document.createElement('img')
  img.className = 'mouth-bg-user'
  img.src = ASSETS.mouthBoard
  img.alt = ''
  img.draggable = false
  img.decoding = 'async'
  img.loading = 'eager'
  img.setAttribute('fetchpriority', 'high')

  const settleFromDom = (): void => {
    if (img.naturalWidth <= 0) return
    const decoded = img.decode?.()
    if (decoded) {
      decoded.then(markMouthBackgroundReady).catch(markMouthBackgroundReady)
    } else {
      markMouthBackgroundReady()
    }
  }
  img.addEventListener('load', settleFromDom, { once: true })
  if (img.complete && img.naturalWidth > 0) settleFromDom()

  board.appendChild(img)
  scene.appendChild(board)
  return scene
}

export function getMouthBoard(sceneRoot: HTMLElement): HTMLElement {
  const board = sceneRoot.querySelector<HTMLElement>('[data-mouth-board]')
  if (!board) throw new Error('mouth board missing')
  return board
}

export function layoutMouthBoard(
  scene: HTMLElement,
  _board: HTMLElement,
  hud?: HTMLElement | null,
): void {
  if (!hud) return
  const top = Math.max(0, Math.round(hud.getBoundingClientRect().height))
  scene.style.top = `${top}px`
  scene.style.setProperty('--hud-offset', `${top}px`)
}

/**
 * User BG is displayed with object-fit: fill across the play rect,
 * so image % maps 1:1 to board %.
 */
export function mapImagePercentToBoard(
  _board: HTMLElement,
  imageX: number,
  imageY: number,
): { x: number; y: number } {
  return { x: imageX, y: imageY }
}
