import { ASSETS, GAME, type SpawnAnchor } from './config'

export type ToothbrushState = 'idle' | 'retreating' | 'empty'

export type ToothbrushCallbacks = {
  /** User tapped the bonus item — start sweep (score happens via germ clears). */
  onActivated: (item: ToothbrushController) => void
  /** Auto-retreat finished with no tap — free the slot, no penalty. */
  onMissComplete: (item: ToothbrushController) => void
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * Bonus toothbrush pick-up. Does not count toward concurrent germs.
 * Visual only for sparkle/pulse — no on-screen explanatory text.
 */
export class ToothbrushController {
  private el: HTMLButtonElement
  private stage: HTMLElement
  private callbacks: ToothbrushCallbacks
  private currentAnchorId: string | null = null
  private state: ToothbrushState = 'empty'
  private destroyed = false
  private dwellTimer: number | null = null
  private retreatTimer: number | null = null

  constructor(stage: HTMLElement, callbacks: ToothbrushCallbacks) {
    this.stage = stage
    this.callbacks = callbacks
    this.el = document.createElement('button')
    this.el.type = 'button'
    this.el.className = 'toothbrush is-hidden'
    this.el.setAttribute('aria-label', '칫솔')
    this.el.style.setProperty('--toothbrush-size', `${GAME.toothbrushSizeVw}cqw`)
    this.el.innerHTML = `
      <span class="toothbrush__glow" aria-hidden="true"></span>
      <img class="toothbrush__art" src="${ASSETS.toothbrush}" alt="" draggable="false" />
      <span class="toothbrush__spark toothbrush__spark--a" aria-hidden="true"></span>
      <span class="toothbrush__spark toothbrush__spark--b" aria-hidden="true"></span>
      <span class="toothbrush__spark toothbrush__spark--c" aria-hidden="true"></span>
    `
    // pointerdown for touch/pen; click as mouse fallback (automation + desktop).
    this.el.addEventListener('pointerdown', this.handleTap, { passive: false })
    this.el.addEventListener('click', this.handleClick)
    this.stage.appendChild(this.el)
  }

  get anchorId(): string | null {
    return this.currentAnchorId
  }

  get isActive(): boolean {
    return this.state === 'idle' || this.state === 'retreating'
  }

  placeAt(anchor: SpawnAnchor, dwellMs?: number): void {
    if (this.destroyed) return
    this.clearTimers()
    this.currentAnchorId = anchor.id
    this.state = 'idle'
    this.el.classList.remove('is-retreating', 'is-hidden')
    this.el.style.left = `${anchor.x}%`
    this.el.style.top = `${anchor.y}%`
    this.el.classList.add('is-idle')

    const dwell =
      dwellMs ??
      Math.round(randBetween(GAME.toothbrushDwellMinMs, GAME.toothbrushDwellMaxMs))
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = null
      this.beginRetreat()
    }, dwell)
  }

  hide(): void {
    this.clearTimers()
    this.state = 'empty'
    this.currentAnchorId = null
    this.el.classList.remove('is-idle', 'is-retreating')
    this.el.classList.add('is-hidden')
  }

  destroy(): void {
    this.destroyed = true
    this.clearTimers()
    this.el.removeEventListener('pointerdown', this.handleTap)
    this.el.removeEventListener('click', this.handleClick)
    this.el.remove()
  }

  private beginRetreat(): void {
    if (this.destroyed || this.state !== 'idle') return
    this.state = 'retreating'
    this.el.classList.remove('is-idle')
    this.el.classList.add('is-retreating')
    this.retreatTimer = window.setTimeout(() => {
      this.retreatTimer = null
      if (this.destroyed || this.state !== 'retreating') return
      const finished = this
      this.state = 'empty'
      this.el.classList.remove('is-retreating')
      this.el.classList.add('is-hidden')
      this.callbacks.onMissComplete(finished)
      this.currentAnchorId = null
    }, GAME.toothbrushRetreatMs)
  }

  private clearTimers(): void {
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }
    if (this.retreatTimer !== null) {
      window.clearTimeout(this.retreatTimer)
      this.retreatTimer = null
    }
  }

  private handleTap = (event: PointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    this.activate()
  }

  private handleClick = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    this.activate()
  }

  private activate(): void {
    if (this.destroyed || this.state !== 'idle') return

    this.clearTimers()
    this.state = 'empty'
    this.el.classList.remove('is-idle')
    this.el.classList.add('is-hidden')
    // Keep anchorId until game releases it in beginToothbrushSweep.
    this.callbacks.onActivated(this)
    this.currentAnchorId = null
  }
}
