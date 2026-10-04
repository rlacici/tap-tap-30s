import { spawnCatchFx, type CatchFxStyle } from './catchFx'
import { ASSETS, GAME, type SpawnAnchor } from './config'

export type GermState = 'idle' | 'squashing' | 'popping' | 'retreating' | 'empty'

export type GermCallbacks = {
  /** Fired when catch is confirmed (entering pop) — score here. */
  onCaught: (germ: GermController) => void
  /** Fired after pop finishes — free the slot (no auto-replace). */
  onPopComplete: (germ: GermController) => void
  /** Fired after miss retreat (“쏙”) finishes — free the slot. */
  onMissComplete: (germ: GermController) => void
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export class GermController {
  private el: HTMLButtonElement
  private floatLayer: HTMLElement
  private stage: HTMLElement
  private callbacks: GermCallbacks
  private currentAnchorId: string | null = null
  private state: GermState = 'empty'
  private destroyed = false
  private squashTimer: number | null = null
  private popTimer: number | null = null
  private dwellTimer: number | null = null
  private retreatTimer: number | null = null

  constructor(
    stage: HTMLElement,
    floatLayer: HTMLElement,
    callbacks: GermCallbacks,
    idleDelayMs = 0,
  ) {
    this.stage = stage
    this.floatLayer = floatLayer
    this.callbacks = callbacks
    this.el = document.createElement('button')
    this.el.type = 'button'
    this.el.className = 'germ is-hidden'
    this.el.setAttribute('aria-label', '충치균 잡기')
    this.el.innerHTML = `
      <span class="germ__shadow"></span>
      <img class="germ__art" src="${ASSETS.germ}" alt="" draggable="false" />
    `
    this.el.style.animationDelay = `${idleDelayMs}ms`
    this.el.addEventListener('pointerdown', this.handleTap, { passive: false })
    this.stage.appendChild(this.el)
  }

  get anchorId(): string | null {
    return this.currentAnchorId
  }

  get germState(): GermState {
    return this.state
  }

  get isActive(): boolean {
    return this.state === 'idle' || this.state === 'squashing' || this.state === 'popping' || this.state === 'retreating'
  }

  /** Board % position for sweep path sorting (center of germ). */
  get boardPos(): { x: number; y: number } {
    return {
      x: parseFloat(this.el.style.left) || 0,
      y: parseFloat(this.el.style.top) || 0,
    }
  }

  /**
   * Programmatic catch used by toothbrush sweep.
   * Reuses the same squash → particles/+1 → onCaught → pop path as a tap.
   * Returns false if already scoring/empty (avoids double-count).
   */
  forceCatch(): boolean {
    if (this.destroyed) return false
    if (this.state === 'squashing' || this.state === 'popping' || this.state === 'empty') {
      return false
    }

    // Cancel miss / retreat timers — this germ is being cleared by the sweep.
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }
    if (this.retreatTimer !== null) {
      window.clearTimeout(this.retreatTimer)
      this.retreatTimer = null
    }
    this.el.classList.remove('is-retreating')

    this.beginCatch('sweep')
    return true
  }

  placeAt(anchor: SpawnAnchor, dwellMs?: number): void {
    if (this.destroyed) return
    this.clearAnimTimers()
    this.currentAnchorId = anchor.id
    this.state = 'idle'
    this.el.classList.remove('is-squashing', 'is-popping', 'is-retreating', 'is-hidden')
    this.el.style.left = `${anchor.x}%`
    this.el.style.top = `${anchor.y}%`
    this.el.style.animation = 'none'
    void this.el.offsetWidth
    this.el.style.animation = ''
    this.el.classList.add('is-idle')

    const dwell =
      dwellMs ??
      Math.round(randBetween(GAME.dwellMinMs, GAME.dwellMaxMs))
    this.dwellTimer = window.setTimeout(() => {
      this.dwellTimer = null
      this.beginRetreat()
    }, dwell)
  }

  hide(): void {
    this.clearAnimTimers()
    this.state = 'empty'
    this.currentAnchorId = null
    this.el.classList.remove('is-idle', 'is-squashing', 'is-popping', 'is-retreating')
    this.el.classList.add('is-hidden')
  }

  destroy(): void {
    this.destroyed = true
    this.clearAnimTimers()
    this.el.removeEventListener('pointerdown', this.handleTap)
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
    }, GAME.retreatMs)
  }

  private clearAnimTimers(): void {
    if (this.squashTimer !== null) {
      window.clearTimeout(this.squashTimer)
      this.squashTimer = null
    }
    if (this.popTimer !== null) {
      window.clearTimeout(this.popTimer)
      this.popTimer = null
    }
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
    if (this.destroyed || this.state !== 'idle') return

    // Cancel miss timer — this germ was caught.
    if (this.dwellTimer !== null) {
      window.clearTimeout(this.dwellTimer)
      this.dwellTimer = null
    }

    this.beginCatch('tap')
  }

  /** Shared tap / sweep catch sequence (score once via onCaught). */
  private beginCatch(style: CatchFxStyle = 'tap'): void {
    this.state = 'squashing'
    this.el.classList.remove('is-idle', 'is-retreating')
    this.el.classList.add('is-squashing')

    const rect = this.el.getBoundingClientRect()
    const floatRect = this.floatLayer.getBoundingClientRect()
    const fx = rect.left + rect.width / 2 - floatRect.left
    const fy = rect.top + rect.height / 2 - floatRect.top

    this.el.style.setProperty('--squash-ms', `${GAME.squashMs}ms`)
    this.el.style.setProperty('--pop-ms', `${GAME.popMs}ms`)

    this.squashTimer = window.setTimeout(() => {
      this.squashTimer = null
      if (this.destroyed || this.state !== 'squashing') return

      this.state = 'popping'
      this.el.classList.remove('is-squashing')
      this.el.classList.add('is-popping')
      // VFX only — score increments once via onCaught below.
      // Sweep clears use stronger firework/+1; normal taps stay unchanged.
      spawnCatchFx(this.floatLayer, fx, fy, style)
      this.callbacks.onCaught(this)

      this.popTimer = window.setTimeout(() => {
        this.popTimer = null
        if (this.destroyed || this.state !== 'popping') return

        const finished = this
        this.state = 'empty'
        this.el.classList.remove('is-popping')
        this.el.classList.add('is-hidden')
        this.callbacks.onPopComplete(finished)
        this.currentAnchorId = null
      }, GAME.popMs)
    }, GAME.squashMs)
  }
}
