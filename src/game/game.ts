import { TOOTH_ANCHORS, type ToothKind } from './teethLayout'

/**
 * Gameplay + whack-a-mole spawn tunables (tweak here).
 *
 * Whack-a-mole knobs:
 * - concurrentGerms     max germs on screen at once
 * - dwellMinMs/MaxMs    how long each germ stays before auto-retreat (“쏙”)
 * - spawnIntervalMin/MaxMs  delay between spawn waves (after previous wave starts)
 * - burstChance         0–1 chance a wave spawns multiple germs in a short burst
 * - burstExtraMin/Max   extra germs beyond the first when bursting (total ≤ concurrentGerms)
 * - burstGapMs          delay between germs inside a burst
 * - retreatMs           duration of the miss “쏙” shrink animation
 *
 * Tap-catch VFX knobs (only on user tap — never on miss/retreat):
 * - squashMs            short press/squash before the burst
 * - popMs               germ hide after squash (frees pool slot; keep short so next catch isn’t blocked)
 * - catchParticleCount  how many star/circle/spark bits (keep low for mobile)
 * - catchSpreadPx       how far particles fly from the tap point
 * - catchFxMs           particle burst lifetime
 * - catchPlusOneMs      +1 float duration (then removed)
 * - catchPlusOneRisePx  how far +1 travels upward (CSS px)
 * - catchPlusOneScale   peak scale of the +1
 *
 * Toothbrush bonus knobs (independent of germ concurrent cap):
 * - toothbrushSpawnsPerGameMin/Max  planned appearances per 30s round (~1–2)
 * - toothbrushSpawnEarliest/LatestSec  game-time window for planned spawns
 * - toothbrushSpawnGapSec           min seconds between planned spawns
 * - toothbrushDwellMin/MaxMs        idle time before bonus auto-retreat
 * - toothbrushRetreatMs             bonus miss retreat length
 * - toothbrushSweepMs               full AOE sweep duration (timer paused; 4s)
 * - toothbrushEnsureGerms           target free/active germs before bonus spawn (~5)
 * - toothbrushEnsureWaitMs          max prepare wait before best-effort bonus spawn
 * - toothbrushEnsureTopUpMin/Max    germs per prepare top-up tick (up to all missing)
 * - toothbrushSweepClearStart/End   sequential clear window within the sweep
 * - toothbrushSizeVw / SweepWidthPct  pickable size vs sweeping brush size
 * - toothbrushSweepCatch*           stronger pop FX only for sweep clears
 * - toothbrushSweepTrail*           glitter trail behind the sweeping brush
 */
export const GAME = {
  durationSec: 30,
  germSizeVw: 18,

  /** Short squash/press on tap-catch. */
  squashMs: 90,
  /** Germ pop/hide after squash — frees the pool slot quickly. */
  popMs: 200,
  /** @deprecated use catchPlusOneMs — kept as alias for clarity in older notes. */
  floatScoreMs: 800,

  /** Max concurrent germs on screen (normal WAM). */
  concurrentGerms: 4,
  /** Min/max time a germ stays idle before auto-despawn (miss). */
  dwellMinMs: 1000,
  dwellMaxMs: 2000,
  /** Random delay between spawn waves (independent of catches). */
  spawnIntervalMinMs: 350,
  spawnIntervalMaxMs: 900,
  /** Chance a wave is a short burst of several germs. */
  burstChance: 0.32,
  /** Extra germs in a burst (in addition to the first). */
  burstExtraMin: 1,
  burstExtraMax: 2,
  /** Gap between successive germs inside a burst. */
  burstGapMs: 120,
  /** Miss despawn “쏙” animation length. */
  retreatMs: 220,

  // --- Tap-catch VFX only (not used by miss/retreat) ---
  /** Particle count for the catch burst (mobile-friendly). */
  catchParticleCount: 39,
  /** Max travel distance of particles from the catch point (CSS px; ≈ one germ = germSizeVw% of 430). */
  catchSpreadPx: 94,
  /** Lifetime of firework particles. */
  catchFxMs: 800,
  /** How long the floating +1 stays before cleanup. */
  catchPlusOneMs: 800,
  /** Upward travel of +1 (CSS px). */
  catchPlusOneRisePx: 78,
  /** Peak scale of +1 during float. */
  catchPlusOneScale: 1.28,

  // --- Toothbrush bonus (does not count toward concurrentGerms) ---
  /** Bonus item size vs phone width (germ uses --germ-size 18cqw). */
  toothbrushSizeVw: 26,
  /** How many bonus spawns to plan per 30s round. */
  toothbrushSpawnsPerGameMin: 1,
  toothbrushSpawnsPerGameMax: 2,
  /** Earliest / latest game-second a bonus may appear (timer-paused time). */
  toothbrushSpawnEarliestSec: 4,
  toothbrushSpawnLatestSec: 24,
  /** Min gap between planned bonus spawn times (seconds). */
  toothbrushSpawnGapSec: 8,
  /** Idle dwell before auto-retreat (no penalty). */
  toothbrushDwellMinMs: 2000,
  toothbrushDwellMaxMs: 3000,
  /** Miss retreat animation length for the bonus item. */
  toothbrushRetreatMs: 220,
  /** Full sweep travel duration (timer paused; no new germ spawns). 4s feel. */
  toothbrushSweepMs: 4000,
  /**
   * Before a planned toothbrush spawn: briefly allow up to this many active
   * germs so the sweep has a fuller board. Normal WAM stays at concurrentGerms.
   */
  toothbrushEnsureGerms: 5,
  /**
   * Max prepare wait (ms) before best-effort brush spawn.
   * Prefer waiting until active >= toothbrushEnsureGerms; after this cap, keep
   * filling briefly while free anchors remain, then spawn.
   */
  toothbrushEnsureWaitMs: 2200,
  /** Aggressive prepare top-ups (batch can fill all missing up to target). */
  toothbrushEnsureTopUpMin: 5,
  toothbrushEnsureTopUpMax: 5,
  /** Fraction of sweep before first sequential clear / after last clear. */
  toothbrushSweepClearStart: 0.14,
  toothbrushSweepClearEnd: 0.86,
  /** Sweep brush width as % of play-board width. */
  toothbrushSweepWidthPct: 78,

  // --- Sweep-only catch FX boost (normal tap uses catch* above) ---
  toothbrushSweepCatchParticleCount: 44,
  toothbrushSweepCatchSpreadPx: 112,
  toothbrushSweepCatchFxMs: 980,
  toothbrushSweepCatchPlusOneMs: 980,
  toothbrushSweepCatchPlusOneRisePx: 96,
  toothbrushSweepCatchPlusOneScale: 1.48,

  // --- Sweep glitter trail (“샤라랑”) — soft twinkles left behind the brush ---
  /** How often to emit a sparkle burst along the trail (ms). */
  toothbrushSweepTrailEveryMs: 46,
  /** How long each trail sparkle lives before fade-out. */
  toothbrushSweepTrailLifeMs: 560,
  /** Sparkles spawned per emit tick. */
  toothbrushSweepTrailBurst: 3,
} as const

/** Prefix public asset paths with Vite `base` (GitHub Pages project sites). */
function withBase(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const clean = path.replace(/^\//, '')
  return `${base.endsWith('/') ? base : `${base}/`}${clean}`
}

export const ASSETS = {
  /** Full-resolution germ for in-game tap targets (optimized webp). */
  germ: withBase('assets/germ.webp'),
  /** Compact start-screen hero (preloaded; lighter than full art). */
  germHero: withBase('assets/germ-hero.webp'),
  /** Michuhol health center mark (full source). */
  michuholMark: withBase('assets/michuhol-health-mark.png'),
  /** Compact HUD mark. */
  michuholMarkHud: withBase('assets/michuhol-mark.webp'),
  /** User-supplied full-bleed mouth play background (937×1678 ≈ 430∶770). */
  mouthBoard: withBase('assets/user-mouth-background.webp'),
  mouthChart: withBase('assets/mouth-chart.png'),
  mouthBg: withBase('assets/mouth-bg.jpg'),
  /** Bonus toothbrush item + sweep brush (user-supplied art, webp). */
  toothbrush: withBase('assets/toothbrush.webp'),
} as const

export type SpawnAnchor = {
  id: string
  x: number
  y: number
  arch: 'upper' | 'lower' | 'tongue'
  kind: ToothKind
}

export const SPAWN_ANCHORS: SpawnAnchor[] = TOOTH_ANCHORS.map((t) => ({
  id: t.id,
  x: t.x,
  y: t.y,
  arch: t.arch,
  kind: t.kind,
}))
