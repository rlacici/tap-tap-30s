import { ASSETS, GAME, SPAWN_ANCHORS, type SpawnAnchor } from './config'
import { GermController } from './germ'
import {
  createMouthScene,
  getMouthBoard,
  layoutMouthBoard,
  mapImagePercentToBoard,
  whenMouthBackgroundReady,
} from './mouth'
import { retryCriticalAssets, whenCriticalAssetsReady } from './preload'
import {
  bumpTop3CacheSeq,
  currentTop3CacheSeq,
  ensureScoreInTop3,
  fetchSheetsTop3,
  getCachedTop3,
  logSheetsEvent,
  mergeOptimisticTop3,
  setCachedTop3,
  submitSheetsScore,
  type Top3Scores,
} from './sheetsLog'
import { ToothbrushController } from './toothbrush'

type Screen = 'start' | 'playing' | 'result'

function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export class CavityTapGame {
  private root: HTMLElement
  private hud!: HTMLElement
  private hudTime!: HTMLElement
  private hudScore!: HTMLElement
  private endCountdown!: HTMLElement
  private overlay!: HTMLElement
  private stage!: HTMLElement
  /** Last 5…1 digit already flashed (avoid repeat ticks). */
  private lastEndCountdownDigit: number | null = null
  private mouthScene!: HTMLElement
  private mouthBoard!: HTMLElement
  private germs: GermController[] = []
  private toothbrush!: ToothbrushController
  private occupiedAnchors = new Set<string>()
  private score = 0
  private timeLeft: number = GAME.durationSec
  private elapsedSec = 0
  /** Remaining countdown in ms (wall-clock; paused while hidden or sweeping). */
  private remainingMs: number = GAME.durationSec * 1000
  /** Accumulated play time in ms (for toothbrush plan seconds). */
  private elapsedMs = 0
  private lastTimerNow: number | null = null
  private timerId: number | null = null
  private spawnTimer: number | null = null
  private burstTimers: number[] = []
  private sweepClearTimers: number[] = []
  private sweepEndTimer: number | null = null
  private sweepTrailTimer: number | null = null
  private sweepTrailCleanup: number | null = null
  /** Planned game-seconds (elapsed) when a toothbrush should appear. */
  private toothbrushPlan: number[] = []
  private sweeping = false
  /**
   * True from toothbrush prepare-window start until retreat/sweep ends.
   * Temporarily allows concurrent germs up to toothbrushEnsureGerms.
   */
  private brushEnsure = false
  private brushEnsureStartedAt = 0
  private brushEnsureTimer: number | null = null
  private brushEnsureTopUpTimers: number[] = []
  /**
   * While true, germ miss-dwell is frozen (prepare + brush idle).
   * Cleared when sweep starts (no resume — sweep clears) or brush leaves without tap (resume).
   */
  private germMissFrozen = false
  /** True while document is hidden during an active round (timer/spawner paused). */
  private backgroundPaused = false
  private screen: Screen = 'start'
  /** Bumps each result screen so a late prior-round TOP3 sync cannot overwrite UI. */
  private resultSyncGen = 0
  /** Bumps on prefetch / result so late TOP3 GETs cannot clobber fresher cache. */
  private top3PrefetchGen = 0
  private onResize = (): void => {
    layoutMouthBoard(this.mouthScene, this.mouthBoard, this.hud)
    this.fitHudBrand()
    if (this.screen === 'start') this.fitStartEyebrow()
  }
  private onVisibilityChange = (): void => {
    this.handleVisibilityChange()
  }

  /** Grow HUD brand type to fill the center strip (one line, no wrap). */
  private fitHudBrand(): void {
    const brand = this.root.querySelector<HTMLElement>('.brand')
    const text = this.root.querySelector<HTMLElement>('.brand__text')
    const mark = this.root.querySelector<HTMLElement>('.brand__mark')
    if (!brand || !text) return

    const brandWidth = brand.clientWidth
    if (brandWidth <= 0) return

    const markW = mark?.getBoundingClientRect().width ?? 0
    const gap = 6
    const available = Math.max(40, brandWidth - markW - gap)
    // Leave a little breathing room so it doesn't kiss the chips.
    const target = available * 0.96

    let lo = 10
    let hi = 22
    let best = lo
    text.style.letterSpacing = '-0.045em'
    text.style.whiteSpace = 'nowrap'

    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      text.style.fontSize = `${mid}px`
      const w = text.scrollWidth
      if (w <= target) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }

    text.style.fontSize = `${best.toFixed(2)}px`
    if (mark) {
      const markSize = Math.max(18, Math.min(28, best * 1.15))
      mark.style.width = `${markSize}px`
      mark.style.height = `${markSize}px`
    }
  }

  /** Scale start-panel eyebrow to the widest single line that fits the panel. */
  private fitStartEyebrow(): void {
    const panel = this.overlay.querySelector<HTMLElement>('.panel--start')
    const eyebrow = this.overlay.querySelector<HTMLElement>('.panel__eyebrow')
    if (!panel || !eyebrow || this.screen !== 'start') return

    const styles = getComputedStyle(panel)
    const padX =
      (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
    // Leave a couple px so glyphs don't kiss the border.
    const available = Math.max(40, panel.clientWidth - padX - 4)
    if (available <= 0) return

    eyebrow.style.whiteSpace = 'nowrap'
    eyebrow.style.letterSpacing = '-0.045em'
    // Unconstrain while measuring — max-width:100% makes scrollWidth report the box, not the text.
    eyebrow.style.maxWidth = 'none'
    eyebrow.style.overflow = 'visible'
    eyebrow.style.display = 'inline-block'

    let lo = 14
    let hi = 36
    let best = lo
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2
      eyebrow.style.fontSize = `${mid}px`
      if (eyebrow.scrollWidth <= available) {
        best = mid
        lo = mid
      } else {
        hi = mid
      }
    }
    eyebrow.style.fontSize = `${best.toFixed(2)}px`
    eyebrow.style.maxWidth = '100%'
    eyebrow.style.overflow = 'hidden'
    eyebrow.style.display = ''
  }

  constructor(host: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'game-shell'
    host.appendChild(this.root)
    this.renderShell()
    this.showStart()
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <div class="phone-frame">
        <header class="hud" aria-live="polite">
          <div class="hud__chip hud__time">
            <span class="hud__label">시간</span>
            <span class="hud__value" data-hud="time">${GAME.durationSec}</span>
          </div>
          <div class="brand" aria-label="미추홀구보건소와 함께 해요!">
            <img
              class="brand__mark"
              src="${ASSETS.michuholMarkHud}"
              width="128"
              height="128"
              alt=""
              draggable="false"
              decoding="async"
            />
            <span class="brand__text">미추홀구보건소와 함께 해요!</span>
          </div>
          <div class="hud__chip hud__score">
            <span class="hud__label">점수</span>
            <span class="hud__value" data-hud="score">0</span>
          </div>
        </header>

        <div class="stage" data-stage>
          <div class="float-layer" data-float></div>
        </div>

        <div
          class="end-countdown"
          data-end-countdown
          hidden
          aria-hidden="true"
        ></div>

        <div class="overlay" data-overlay></div>
      </div>
    `

    this.hud = this.root.querySelector('.hud')!
    this.hudTime = this.root.querySelector('[data-hud="time"]')!
    this.hudScore = this.root.querySelector('[data-hud="score"]')!
    this.endCountdown = this.root.querySelector('[data-end-countdown]')!
    this.overlay = this.root.querySelector('[data-overlay]')!
    this.stage = this.root.querySelector('[data-stage]')!

    const mouth = createMouthScene()
    this.mouthScene = mouth
    this.stage.insertBefore(mouth, this.stage.firstChild)
    this.mouthBoard = getMouthBoard(mouth)
    layoutMouthBoard(this.mouthScene, this.mouthBoard, this.hud)
    window.addEventListener('resize', this.onResize)
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    const floatLayer = this.root.querySelector('[data-float]') as HTMLElement
    // Pool must cover temporary toothbrush ensure cap (e.g. 5), not only normal WAM.
    const poolSize = Math.max(1, GAME.concurrentGerms, GAME.toothbrushEnsureGerms)
    for (let i = 0; i < poolSize; i++) {
      this.germs.push(
        new GermController(
          this.mouthBoard,
          floatLayer,
          {
            onCaught: () => this.handleCatch(),
            onPopComplete: (germ) => this.handleSlotFree(germ),
            onMissComplete: (germ) => this.handleSlotFree(germ),
          },
          i * 40,
        ),
      )
    }
    this.toothbrush = new ToothbrushController(this.mouthBoard, {
      onActivated: () => this.beginToothbrushSweep(),
      onMissComplete: (item) => {
        this.releaseAnchor(item.anchorId)
        this.endBrushEnsure()
      },
    })
    this.hideAllGerms()
    requestAnimationFrame(() => this.fitHudBrand())
  }

  private showStart(): void {
    this.screen = 'start'
    this.stopTimer()
    this.stopSpawner()
    this.hideAllGerms()
    this.overlay.hidden = false
    this.overlay.innerHTML = `
      <div class="panel panel--start">
        <img
          class="panel__hero"
          src="${ASSETS.germHero}"
          width="320"
          height="320"
          alt=""
          draggable="false"
          decoding="async"
          fetchpriority="high"
        />
        <p class="panel__eyebrow">미추홀구보건소와 함께하는</p>
        <h1 class="panel__title">탭탭! 30초 미션</h1>
        <p class="panel__copy">입속에 나타난 충치균을<br />톡톡 잡아보세요!</p>
        <p class="panel__hint" aria-label="힌트">
          <span class="panel__hint-label">💡 힌트!</span>
          반짝이는 칫솔이 나오면 톡!<br />쓸고 지나가며 충치균을 잡아요!
        </p>
        <p class="panel__load-status" data-load-status hidden></p>
        <button type="button" class="btn btn--gated" data-action="start" disabled aria-disabled="true">
          불러오는 중…
        </button>
      </div>
    `
    const startBtn = this.overlay.querySelector<HTMLButtonElement>('[data-action="start"]')!
    const loadStatus = this.overlay.querySelector<HTMLElement>('[data-load-status]')!
    let assetsReady = false

    const enableStart = (): void => {
      if (this.screen !== 'start') return
      assetsReady = true
      loadStatus.hidden = true
      loadStatus.textContent = ''
      startBtn.disabled = false
      startBtn.removeAttribute('aria-disabled')
      startBtn.classList.remove('btn--gated')
      startBtn.dataset.action = 'start'
      startBtn.textContent = '시작하기'
    }

    const showLoadFailure = (): void => {
      if (this.screen !== 'start') return
      assetsReady = false
      loadStatus.hidden = false
      loadStatus.textContent = '이미지를 불러오지 못했어요. 다시 시도해 주세요.'
      startBtn.disabled = false
      startBtn.removeAttribute('aria-disabled')
      startBtn.classList.remove('btn--gated')
      startBtn.dataset.action = 'retry-assets'
      startBtn.textContent = '다시 불러오기'
    }

    const showLoading = (): void => {
      if (this.screen !== 'start') return
      assetsReady = false
      loadStatus.hidden = true
      loadStatus.textContent = ''
      startBtn.disabled = true
      startBtn.setAttribute('aria-disabled', 'true')
      startBtn.classList.add('btn--gated')
      startBtn.dataset.action = 'start'
      startBtn.textContent = '불러오는 중…'
    }

    startBtn.addEventListener('click', () => {
      if (startBtn.disabled) return
      if (startBtn.dataset.action === 'retry-assets') {
        showLoading()
        void retryCriticalAssets().then(enableStart).catch(showLoadFailure)
        return
      }
      if (!assetsReady) return
      this.startRound()
    })

    // Prefetch server TOP3 into session/memory so first-play and post-reset
    // optimistic boards are not stale (sheet clear → [0,0,0] before play).
    this.prefetchTop3Cache()

    void whenCriticalAssetsReady()
      .then(() => {
        enableStart()
        // Dev helper: `?result=1` jumps to the result panel for TOP3/tip proof.
        if (
          import.meta.env.DEV &&
          new URLSearchParams(location.search).has('result')
        ) {
          this.score = 12
          this.endRound()
        }
      })
      .catch(showLoadFailure)

    requestAnimationFrame(() => {
      this.fitStartEyebrow()
      requestAnimationFrame(() => this.fitStartEyebrow())
    })
  }

  /**
   * Refresh TOP3 cache from server (start panel + each round start).
   * Never paints UI — only warms sessionStorage/memory for optimistic merge.
   * Late responses are dropped if a newer prefetch/result already advanced gen.
   */
  private prefetchTop3Cache(): void {
    const gen = ++this.top3PrefetchGen
    const expectSeq = currentTop3CacheSeq()
    void fetchSheetsTop3({ expectSeq })
      .then((top3) => {
        if (!top3) return
        if (gen !== this.top3PrefetchGen) return
        // Result sync owns cache during the result screen.
        if (this.screen === 'result') return
      })
      .catch(() => {
        // Prefetch is best-effort — game must not depend on Sheets.
      })
  }

  private startRound(): void {
    this.screen = 'playing'
    // Retry skips the start panel — refresh cache before this round's optimistic.
    this.prefetchTop3Cache()
    this.score = 0
    this.timeLeft = GAME.durationSec
    this.elapsedSec = 0
    this.remainingMs = GAME.durationSec * 1000
    this.elapsedMs = 0
    this.backgroundPaused = false
    this.sweeping = false
    this.endBrushEnsure(false)
    this.mouthBoard.classList.remove('is-sweeping')
    this.clearSweepRuntime()
    this.planToothbrushSpawns()
    this.clearEndCountdown()
    this.hudScore.textContent = '0'
    this.hudTime.textContent = String(this.timeLeft)
    // Dev helper: `?endcd=1` starts near the final 5s flash.
    if (
      import.meta.env.DEV &&
      new URLSearchParams(location.search).has('endcd')
    ) {
      this.remainingMs = 5500
      this.timeLeft = Math.ceil(this.remainingMs / 1000)
      this.hudTime.textContent = String(this.timeLeft)
    }
    this.overlay.hidden = true
    this.overlay.innerHTML = ''
    this.stopSpawner()
    this.hideAllGerms()
    this.startTimer()
    // Playing UI can show immediately, but hold WAM until mouth BG is painted/ready.
    void whenMouthBackgroundReady().then(() => {
      if (this.screen !== 'playing') return
      requestAnimationFrame(() => {
        layoutMouthBoard(this.mouthScene, this.mouthBoard, this.hud)
        requestAnimationFrame(() => {
          if (this.screen === 'playing' && !this.sweeping && !document.hidden) {
            this.startSpawner()
          }
        })
      })
    })
  }

  /**
   * Wall-clock countdown: accumulates with performance.now(), pauses while
   * sweeping or document.hidden so background/lock doesn't skew the 30s.
   */
  private startTimer(): void {
    this.stopTimer(false)
    this.lastTimerNow = performance.now()
    this.timerId = window.setInterval(() => this.syncTimerFromClock(), 100)
  }

  private stopTimer(flush = true): void {
    if (flush) this.flushTimerClock()
    if (this.timerId !== null) {
      window.clearInterval(this.timerId)
      this.timerId = null
    }
    this.lastTimerNow = null
  }

  private flushTimerClock(): void {
    if (this.lastTimerNow === null || this.sweeping || this.backgroundPaused) return
    const now = performance.now()
    const dt = Math.max(0, now - this.lastTimerNow)
    this.lastTimerNow = now
    this.remainingMs = Math.max(0, this.remainingMs - dt)
    this.elapsedMs += dt
    this.applyTimerDisplay()
  }

  private syncTimerFromClock(): void {
    if (this.screen !== 'playing' || this.sweeping || this.backgroundPaused) return
    if (document.hidden) return
    this.flushTimerClock()
    if (this.remainingMs <= 0) {
      this.endRound()
    }
  }

  private applyTimerDisplay(): void {
    const timeLeft = Math.max(0, Math.ceil(this.remainingMs / 1000))
    const elapsedSec = Math.min(
      GAME.durationSec,
      Math.floor(this.elapsedMs / 1000),
    )
    if (timeLeft !== this.timeLeft) {
      this.timeLeft = timeLeft
      this.hudTime.textContent = String(this.timeLeft)
      // Final 5s: flash 5→1 only (no 0 / 끝!). Taps still hit germs.
      if (timeLeft >= 1 && timeLeft <= 5) {
        this.flashEndCountdown(timeLeft)
      }
    }
    if (elapsedSec > this.elapsedSec) {
      // Catch up toothbrush plans if multiple seconds advanced in one resume.
      for (let sec = this.elapsedSec + 1; sec <= elapsedSec; sec++) {
        this.elapsedSec = sec
        this.trySpawnToothbrushForElapsed()
      }
    }
  }

  /** Center flash for the last 5 seconds — pointer-events none, fade ~0.7s. */
  private flashEndCountdown(digit: number): void {
    if (digit < 1 || digit > 5) return
    if (this.lastEndCountdownDigit === digit) return
    this.lastEndCountdownDigit = digit
    const el = this.endCountdown
    el.textContent = String(digit)
    el.hidden = false
    el.classList.remove('is-tick')
    // Restart CSS animation for each new second.
    void el.offsetWidth
    el.classList.add('is-tick')
  }

  private clearEndCountdown(): void {
    this.lastEndCountdownDigit = null
    this.endCountdown.classList.remove('is-tick')
    this.endCountdown.textContent = ''
    this.endCountdown.hidden = true
  }

  private handleVisibilityChange(): void {
    if (this.screen !== 'playing') return
    if (document.hidden) {
      if (this.backgroundPaused) return
      // Flush remaining time before pausing the clock.
      this.flushTimerClock()
      this.backgroundPaused = true
      this.lastTimerNow = null
      // Freeze new waves while backgrounded (dwell timers on live germs unchanged).
      this.stopSpawner()
      return
    }
    if (!this.backgroundPaused) return
    this.backgroundPaused = false
    if (this.sweeping) return
    this.lastTimerNow = performance.now()
    this.syncTimerFromClock()
    if (this.screen === 'playing' && !this.sweeping) {
      this.startSpawner()
    }
  }

  /** Plan ~1–2 bonus appearances in the mid-round window (game-time seconds). */
  private planToothbrushSpawns(): void {
    // Dev helper: `?brush=1` forces an early spawn for local proof/recording.
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('brush')) {
      this.toothbrushPlan = [2]
      return
    }
    const count = randInt(
      GAME.toothbrushSpawnsPerGameMin,
      GAME.toothbrushSpawnsPerGameMax,
    )
    const earliest = GAME.toothbrushSpawnEarliestSec
    const latest = Math.min(GAME.toothbrushSpawnLatestSec, GAME.durationSec - 3)
    const gap = GAME.toothbrushSpawnGapSec
    const times: number[] = []
    for (let n = 0; n < count; n++) {
      let placed = false
      for (let attempt = 0; attempt < 24; attempt++) {
        const t = randInt(earliest, latest)
        if (times.every((other) => Math.abs(other - t) >= gap)) {
          times.push(t)
          placed = true
          break
        }
      }
      if (!placed && times.length === 0) {
        times.push(Math.round((earliest + latest) / 2))
      }
    }
    this.toothbrushPlan = times.sort((a, b) => a - b)
  }

  private trySpawnToothbrushForElapsed(): void {
    if (this.screen !== 'playing' || this.sweeping) return
    if (!this.toothbrushPlan.includes(this.elapsedSec)) return
    // Drop this planned slot if the previous bonus is still on screen / preparing.
    if (this.toothbrush.isActive || this.brushEnsure) return
    this.beginToothbrushEnsure()
  }

  /**
   * Prepare window before a planned toothbrush spawn:
   * freeze miss-despawn, fill aggressively to toothbrushEnsureGerms, then spawn.
   * Prefer not spawning until target; after wait cap, keep filling briefly while
   * free anchors remain, then best-effort spawn.
   */
  private beginToothbrushEnsure(): void {
    if (this.screen !== 'playing' || this.sweeping || this.brushEnsure) return
    if (this.toothbrush.isActive) return
    this.brushEnsure = true
    this.brushEnsureStartedAt = performance.now()
    this.germMissFrozen = true
    this.freezeActiveGermMissDwells()
    this.tickToothbrushEnsure()
  }

  private freezeActiveGermMissDwells(): void {
    for (const germ of this.germs) {
      if (germ.isActive) germ.freezeMissDwell()
    }
  }

  /** End freeze and optionally restart normal miss dwells on idle germs. */
  private clearGermMissFreeze(resumeDwells: boolean): void {
    this.germMissFrozen = false
    if (!resumeDwells) return
    for (const germ of this.germs) {
      if (germ.germState === 'idle') germ.resumeMissDwell()
    }
  }

  private hasFreeGermAnchor(): boolean {
    return SPAWN_ANCHORS.some((a) => !this.occupiedAnchors.has(a.id))
  }

  private tickToothbrushEnsure(): void {
    this.brushEnsureTimer = null
    if (!this.brushEnsure) return
    if (this.screen !== 'playing' || this.sweeping) {
      this.endBrushEnsure()
      return
    }
    if (this.toothbrush.isActive) return

    const target = GAME.toothbrushEnsureGerms
    const active = this.countActiveGerms()
    const waited = performance.now() - this.brushEnsureStartedAt
    const waitCap = GAME.toothbrushEnsureWaitMs
    /** Brief extra fill after wait cap while free anchors still exist. */
    const fillGraceMs = 600

    const trySpawnBrush = (): boolean => {
      this.spawnToothbrush()
      if (this.toothbrush.isActive) {
        // Cap + miss-freeze stay until retreat / sweep.
        this.clearBrushEnsureTimersOnly()
        return true
      }
      return false
    }

    if (active >= target) {
      if (trySpawnBrush()) return
      // Need a free anchor for the brush — keep trying briefly.
      if (waited < waitCap + fillGraceMs) {
        this.brushEnsureTimer = window.setTimeout(() => this.tickToothbrushEnsure(), 80)
        return
      }
      this.endBrushEnsure()
      return
    }

    // Under target: fill aggressively (batch up to all missing).
    const missing = target - active
    const batch = Math.min(
      missing,
      randInt(GAME.toothbrushEnsureTopUpMin, GAME.toothbrushEnsureTopUpMax),
    )
    const canFill = batch > 0 && this.hasFreeGermAnchor()
    if (canFill) {
      for (let i = 0; i < batch; i++) {
        if (i === 0) {
          this.spawnOneGerm()
        } else {
          const id = window.setTimeout(() => {
            this.brushEnsureTopUpTimers = this.brushEnsureTopUpTimers.filter((t) => t !== id)
            if (this.brushEnsure && this.screen === 'playing' && !this.sweeping) {
              this.spawnOneGerm()
            }
          }, i * GAME.burstGapMs)
          this.brushEnsureTopUpTimers.push(id)
        }
      }
    }

    // Prefer not spawning until target, unless wait cap hit AND (no free anchors
    // or fill-grace after cap exhausted).
    const pastCap = waited >= waitCap
    const pastGrace = waited >= waitCap + fillGraceMs
    const noRoom = !this.hasFreeGermAnchor()
    if (pastCap && (noRoom || pastGrace)) {
      if (trySpawnBrush()) return
      if (!pastGrace) {
        this.brushEnsureTimer = window.setTimeout(() => this.tickToothbrushEnsure(), 80)
        return
      }
      this.endBrushEnsure()
      return
    }

    const nextDelay = canFill
      ? Math.max(120, batch * GAME.burstGapMs + 60)
      : 80
    this.brushEnsureTimer = window.setTimeout(() => this.tickToothbrushEnsure(), nextDelay)
  }

  /** Clear prepare timers but keep elevated concurrent until brush lifecycle ends. */
  private clearBrushEnsureTimersOnly(): void {
    if (this.brushEnsureTimer !== null) {
      window.clearTimeout(this.brushEnsureTimer)
      this.brushEnsureTimer = null
    }
    for (const id of this.brushEnsureTopUpTimers) window.clearTimeout(id)
    this.brushEnsureTopUpTimers = []
  }

  /**
   * Restore normal concurrentGerms after toothbrush retreat / sweep / round end.
   * Brush miss (no tap): resume germ miss dwells. Sweep path clears freeze without resume.
   */
  private endBrushEnsure(resumeGermDwells = true): void {
    this.clearBrushEnsureTimersOnly()
    this.brushEnsure = false
    this.brushEnsureStartedAt = 0
    if (this.germMissFrozen) {
      this.clearGermMissFreeze(resumeGermDwells && !this.sweeping)
    }
  }

  /** Concurrent cap: normal WAM 4, or ensure target while preparing / brush active / sweep. */
  private effectiveConcurrentGerms(): number {
    if (this.brushEnsure || this.toothbrush?.isActive || this.sweeping) {
      return GAME.toothbrushEnsureGerms
    }
    return GAME.concurrentGerms
  }

  private spawnToothbrush(): void {
    if (this.screen !== 'playing' || this.sweeping) return
    if (this.toothbrush.isActive) return

    const avoid = this.toothbrush.anchorId
    const anchor = this.pickFreeAnchor(avoid)
    if (!anchor) return

    this.occupiedAnchors.add(anchor.id)
    const mapped = mapImagePercentToBoard(this.mouthBoard, anchor.x, anchor.y)
    this.toothbrush.placeAt({ ...anchor, x: mapped.x, y: mapped.y })
  }

  private beginToothbrushSweep(): void {
    if (this.screen !== 'playing' || this.sweeping) return
    this.sweeping = true
    this.mouthBoard.classList.add('is-sweeping')
    this.clearBrushEnsureTimersOnly()
    // Freeze window ends at sweep start — do not resume dwells (forceCatch clears).
    this.clearGermMissFreeze(false)
    this.releaseAnchor(this.toothbrush.anchorId)
    this.toothbrush.hide()

    // Pause countdown + stop new germ waves for the sweep only.
    this.stopTimer()
    this.stopSpawner()

    const targets = this.germs
      .filter((g) => g.isActive)
      .sort((a, b) => a.boardPos.x - b.boardPos.x || a.boardPos.y - b.boardPos.y)

    this.playSweepBrush()

    const sweepMs = GAME.toothbrushSweepMs
    const startFrac = GAME.toothbrushSweepClearStart
    const endFrac = GAME.toothbrushSweepClearEnd
    const windowMs = Math.max(0, (endFrac - startFrac) * sweepMs)
    const stagger =
      targets.length <= 1 ? 0 : windowMs / (targets.length - 1)

    for (let i = 0; i < targets.length; i++) {
      const germ = targets[i]!
      const delay = Math.round(startFrac * sweepMs + i * stagger)
      const id = window.setTimeout(() => {
        this.sweepClearTimers = this.sweepClearTimers.filter((t) => t !== id)
        if (this.screen !== 'playing') return
        germ.forceCatch()
      }, delay)
      this.sweepClearTimers.push(id)
    }

    this.sweepEndTimer = window.setTimeout(() => {
      this.sweepEndTimer = null
      this.finishToothbrushSweep()
    }, sweepMs)
  }

  /** Large brush crosses the play board only (mouth-board clipped; HUD untouched). */
  private playSweepBrush(): void {
    const existing = this.mouthBoard.querySelector('.sweep-brush')
    existing?.remove()
    this.mouthBoard.querySelector('.sweep-trail')?.remove()

    const brush = document.createElement('div')
    brush.className = 'sweep-brush'
    brush.setAttribute('aria-hidden', 'true')
    brush.style.setProperty('--sweep-ms', `${GAME.toothbrushSweepMs}ms`)
    brush.style.setProperty('--sweep-width', `${GAME.toothbrushSweepWidthPct}%`)
    brush.innerHTML = `<img class="sweep-brush__art" src="${ASSETS.toothbrush}" alt="" draggable="false" />`
    this.mouthBoard.appendChild(brush)

    const trail = document.createElement('div')
    trail.className = 'sweep-trail'
    trail.setAttribute('aria-hidden', 'true')
    this.mouthBoard.appendChild(trail)

    // Restart CSS animation reliably.
    void brush.offsetWidth
    brush.classList.add('is-running')
    this.startSweepTrail(brush, trail)

    window.setTimeout(() => {
      brush.remove()
    }, GAME.toothbrushSweepMs + 40)
  }

  /** Soft glitter trail left behind the brush as it travels L→R (no text). */
  private startSweepTrail(brush: HTMLElement, trail: HTMLElement): void {
    this.stopSweepTrail()

    const emit = (): void => {
      if (!this.sweeping || !brush.isConnected || !trail.isConnected) return
      const boardRect = this.mouthBoard.getBoundingClientRect()
      if (boardRect.width <= 0) return
      const brushRect = brush.getBoundingClientRect()
      // Trailing edge of the brush (behind travel direction L→R).
      const baseX = brushRect.left - boardRect.left + brushRect.width * 0.12
      const baseY = brushRect.top - boardRect.top + brushRect.height * 0.48
      const burst = Math.max(1, GAME.toothbrushSweepTrailBurst)
      for (let i = 0; i < burst; i++) {
        const s = document.createElement('span')
        const kind = i % 3 === 0 ? 'star' : i % 3 === 1 ? 'dot' : 'cross'
        s.className = `sweep-trail__s sweep-trail__s--${kind}`
        const ox = (Math.random() - 0.55) * brushRect.width * 0.22
        const oy = (Math.random() - 0.5) * brushRect.height * 0.55
        s.style.left = `${baseX + ox}px`
        s.style.top = `${baseY + oy}px`
        s.style.setProperty('--life', `${GAME.toothbrushSweepTrailLifeMs}ms`)
        s.style.setProperty('--drift-x', `${-8 - Math.random() * 22}px`)
        s.style.setProperty('--drift-y', `${(Math.random() - 0.5) * 18}px`)
        s.style.setProperty('--size', `${4 + Math.floor(Math.random() * 7)}px`)
        s.style.setProperty('--delay', `${Math.floor(Math.random() * 30)}ms`)
        trail.appendChild(s)
        window.setTimeout(() => s.remove(), GAME.toothbrushSweepTrailLifeMs + 40)
      }
      this.sweepTrailTimer = window.setTimeout(emit, GAME.toothbrushSweepTrailEveryMs)
    }

    // First emit after brush is visibly on-screen.
    this.sweepTrailTimer = window.setTimeout(emit, 70)
    this.sweepTrailCleanup = window.setTimeout(() => {
      this.sweepTrailCleanup = null
      this.stopSweepTrail()
      trail.remove()
    }, GAME.toothbrushSweepMs + GAME.toothbrushSweepTrailLifeMs + 80)
  }

  private stopSweepTrail(): void {
    if (this.sweepTrailTimer !== null) {
      window.clearTimeout(this.sweepTrailTimer)
      this.sweepTrailTimer = null
    }
    if (this.sweepTrailCleanup !== null) {
      window.clearTimeout(this.sweepTrailCleanup)
      this.sweepTrailCleanup = null
    }
  }

  private finishToothbrushSweep(): void {
    for (const id of this.sweepClearTimers) window.clearTimeout(id)
    this.sweepClearTimers = []
    // Stop emitting new trail sparks; leave fading ones (cleanup timer removes layer).
    if (this.sweepTrailTimer !== null) {
      window.clearTimeout(this.sweepTrailTimer)
      this.sweepTrailTimer = null
    }
    this.mouthBoard.querySelector('.sweep-brush')?.remove()
    this.mouthBoard.classList.remove('is-sweeping')
    this.sweeping = false
    this.endBrushEnsure(false)

    if (this.screen !== 'playing') return
    // Resume immediately — no modal / screen change.
    if (document.hidden) {
      this.backgroundPaused = true
      this.lastTimerNow = null
      return
    }
    this.startTimer()
    this.startSpawner()
  }

  private clearSweepRuntime(): void {
    for (const id of this.sweepClearTimers) window.clearTimeout(id)
    this.sweepClearTimers = []
    if (this.sweepEndTimer !== null) {
      window.clearTimeout(this.sweepEndTimer)
      this.sweepEndTimer = null
    }
    this.stopSweepTrail()
    this.mouthBoard?.querySelector('.sweep-brush')?.remove()
    this.mouthBoard?.querySelector('.sweep-trail')?.remove()
    this.mouthBoard?.classList.remove('is-sweeping')
    this.sweeping = false
    this.endBrushEnsure()
  }

  /** Independent whack-a-mole spawn loop (not tied to catches). */
  private startSpawner(): void {
    this.stopSpawner()
    // First germ appears quickly after start.
    this.spawnTimer = window.setTimeout(() => this.runSpawnWave(), 180)
  }

  private stopSpawner(): void {
    if (this.spawnTimer !== null) {
      window.clearTimeout(this.spawnTimer)
      this.spawnTimer = null
    }
    for (const id of this.burstTimers) window.clearTimeout(id)
    this.burstTimers = []
  }

  private scheduleNextWave(): void {
    if (this.screen !== 'playing') return
    const delay = Math.round(
      randBetween(GAME.spawnIntervalMinMs, GAME.spawnIntervalMaxMs),
    )
    this.spawnTimer = window.setTimeout(() => this.runSpawnWave(), delay)
  }

  private runSpawnWave(): void {
    this.spawnTimer = null
    if (this.screen !== 'playing' || this.sweeping) return

    const freeSlots = this.countFreeGerms()
    if (freeSlots <= 0) {
      this.scheduleNextWave()
      return
    }

    let count = 1
    if (Math.random() < GAME.burstChance && freeSlots > 1) {
      const extra = randInt(GAME.burstExtraMin, GAME.burstExtraMax)
      count = Math.min(freeSlots, 1 + extra)
    } else {
      count = 1
    }

    for (let i = 0; i < count; i++) {
      if (i === 0) {
        this.spawnOneGerm()
      } else {
        const id = window.setTimeout(() => {
          this.burstTimers = this.burstTimers.filter((t) => t !== id)
          if (this.screen === 'playing') this.spawnOneGerm()
        }, i * GAME.burstGapMs)
        this.burstTimers.push(id)
      }
    }

    this.scheduleNextWave()
  }

  private countFreeGerms(): number {
    const freePool = this.germs.filter((g) => !g.isActive).length
    const room = Math.max(0, this.effectiveConcurrentGerms() - this.countActiveGerms())
    return Math.min(freePool, room)
  }

  private countActiveGerms(): number {
    return this.germs.filter((g) => g.isActive).length
  }

  private spawnOneGerm(): void {
    if (this.screen !== 'playing' || this.sweeping) return
    if (this.countActiveGerms() >= this.effectiveConcurrentGerms()) return

    const germ = this.germs.find((g) => !g.isActive)
    if (!germ) return

    const anchor = this.pickFreeAnchor()
    if (!anchor) return

    this.occupiedAnchors.add(anchor.id)
    const mapped = mapImagePercentToBoard(this.mouthBoard, anchor.x, anchor.y)
    // During toothbrush prepare / brush idle: no miss dwell so the board stays full.
    germ.placeAt(
      { ...anchor, x: mapped.x, y: mapped.y },
      this.germMissFrozen ? false : undefined,
    )
  }

  private handleCatch(): void {
    if (this.screen !== 'playing') return
    this.score += 1
    this.hudScore.textContent = String(this.score)
  }

  /** Free slot after tap-pop or miss-retreat — do not auto-replace. */
  private handleSlotFree(germ: GermController): void {
    this.releaseAnchor(germ.anchorId)
  }

  /**
   * Pick a free spawn anchor with fair arch coverage.
   * Previous “farthest from occupied” bias starved the center tongue
   * whenever any tooth was busy. Now: pick a random arch among those
   * that still have free anchors, then a random free point in that arch.
   */
  private pickFreeAnchor(avoidId: string | null = null): SpawnAnchor | null {
    const free = SPAWN_ANCHORS.filter((a) => !this.occupiedAnchors.has(a.id))
    if (free.length === 0) return null
    const preferred =
      avoidId && free.length > 1 ? free.filter((a) => a.id !== avoidId) : free
    const pool = preferred.length > 0 ? preferred : free

    const arches = [...new Set(pool.map((a) => a.arch))]
    const arch = arches[Math.floor(Math.random() * arches.length)]!
    const inArch = pool.filter((a) => a.arch === arch)
    return inArch[Math.floor(Math.random() * inArch.length)]!
  }

  private releaseAnchor(id: string | null): void {
    if (id) this.occupiedAnchors.delete(id)
  }

  private hideAllGerms(): void {
    this.endBrushEnsure(false)
    this.occupiedAnchors.clear()
    for (const germ of this.germs) germ.hide()
    this.toothbrush?.hide()
    const floatLayer = this.root.querySelector('[data-float]')
    if (floatLayer) floatLayer.replaceChildren()
  }

  private endRound(): void {
    this.screen = 'result'
    this.clearSweepRuntime()
    this.endBrushEnsure(false)
    this.stopTimer()
    this.stopSpawner()
    this.hideAllGerms()
    this.clearEndCountdown()
    logSheetsEvent('complete')

    // Same-frame optimistic TOP3: numbers in the first result HTML paint.
    // Do not await Sheets — background sync updates later (server may flash).
    // Do NOT persist optimistic to cache — only successful server top3 updates
    // cache (submit failure must not poison the next round's baseline).
    const score = this.score
    // Invalidate in-flight start/round prefetches; result sync owns cache now.
    this.top3PrefetchGen++
    bumpTop3CacheSeq()
    const optimistic = mergeOptimisticTop3(score, getCachedTop3())
    const showTop3 = this.top3HasScores(optimistic)

    this.overlay.hidden = false
    this.overlay.innerHTML = `
      <div class="panel panel--result">
        <h2 class="panel__title">🎉 30초 미션 완료!</h2>
        <p class="panel__score">충치균 <span>${score}</span>마리 잡기 성공!</p>
        <div class="panel__top3" data-top3${showTop3 ? '' : ' hidden'}>
          <p class="panel__top3-title">👑 도전! 기록 TOP 3</p>
          <p class="panel__top3-line" data-top3-rank="1">1위: ${optimistic[0]}마리</p>
          <p class="panel__top3-line" data-top3-rank="2">2위: ${optimistic[1]}마리</p>
          <p class="panel__top3-line" data-top3-rank="3">3위: ${optimistic[2]}마리</p>
        </div>
        <p class="panel__tip">진짜 입속 세균은<br />꼼꼼한 칫솔질로 제거해요!</p>
        <button type="button" class="btn btn--pulse" data-action="retry">다시 도전하기</button>
      </div>
    `
    const retry = this.overlay.querySelector<HTMLButtonElement>('[data-action="retry"]')!
    retry.addEventListener('click', () => {
      retry.classList.remove('btn--pulse')
      logSheetsEvent('retry')
      this.startRound()
    })
    // Fire-and-forget: never blocks result paint or retry.
    const syncGen = ++this.resultSyncGen
    void this.syncResultTop3(score, syncGen)
  }

  private top3HasScores(top3: Top3Scores): boolean {
    return top3[0] > 0 || top3[1] > 0 || top3[2] > 0
  }

  private renderTop3Lines(block: HTMLElement, top3: Top3Scores): void {
    const labels = ['1위', '2위', '3위'] as const
    for (let i = 0; i < 3; i++) {
      const line = block.querySelector(`[data-top3-rank="${i + 1}"]`)
      if (!line) continue
      line.textContent = `${labels[i]}: ${top3[i]!}마리`
    }
  }

  /**
   * Background Sheets sync only. Optimistic TOP3 is already in the result HTML
   * (not written to cache until server success).
   *
   * - Score POST `trustServer`: paint response top3 as-is (ties + no double insert).
   * - Beacon/stale GET: ensureScoreInTop3 once (21-duplicate guard).
   * - Submit failure: keep optimistic on screen; leave cache at pre-round board.
   * - Late prior-round sync ignored via resultSyncGen.
   */
  private async syncResultTop3(score: number, syncGen: number): Promise<void> {
    let result: Awaited<ReturnType<typeof submitSheetsScore>> = null
    try {
      result = await submitSheetsScore(score)
    } catch {
      result = null
    }

    // Drop late sync from a previous result (fast retry) — do not overwrite UI/cache.
    if (this.screen !== 'result' || syncGen !== this.resultSyncGen) return
    const live = this.overlay.querySelector<HTMLElement>('[data-top3]')
    if (!live) return

    if (!result) return // keep optimistic paint; cache untouched (no poison)

    const server = result.top3
    // Authoritative POST board: trust as-is (equal scores both appear).
    // Beacon path may still need a single ensure for stale GET coalesce.
    const display =
      result.trustServer || score <= 0
        ? server
        : ensureScoreInTop3(score, server)
    this.top3PrefetchGen++
    setCachedTop3(display, { authoritative: result.trustServer })
    if (this.top3HasScores(display)) {
      this.renderTop3Lines(live, display)
      live.hidden = false
    } else {
      live.hidden = true
    }
  }
}
