import { GAME } from './config'

const PARTICLE_KINDS = ['star', 'circle', 'spark'] as const

/** Bright colors visible on white teeth and pink gums — never white-only. */
const PARTICLE_COLORS = [
  '#FFD024', // yellow
  '#FF8A1F', // orange
  '#3DB8FF', // sky blue
  '#5EE08A', // light green
  '#FFB020', // deep gold
  '#2AA8F0', // mid sky
] as const

export type CatchFxStyle = 'tap' | 'sweep'

/**
 * Kid-friendly catch burst at (x, y) in float-layer coords.
 * Particles + floating +1 + soft mint ripple ring — never onomatopoeia text.
 * Pointer-events none; self-removes. Score is NOT touched here.
 * `sweep` uses stronger toothbrushSweepCatch* tunables; `tap` keeps normal catch*.
 * Ripple is the same for tap and sweep (only fires on successful catch).
 */
export function spawnCatchFx(
  layer: HTMLElement,
  x: number,
  y: number,
  style: CatchFxStyle = 'tap',
): void {
  const boosted = style === 'sweep'
  const particleCount = boosted
    ? GAME.toothbrushSweepCatchParticleCount
    : GAME.catchParticleCount
  const spreadPx = boosted ? GAME.toothbrushSweepCatchSpreadPx : GAME.catchSpreadPx
  const fxMs = boosted ? GAME.toothbrushSweepCatchFxMs : GAME.catchFxMs
  const plusMs = boosted ? GAME.toothbrushSweepCatchPlusOneMs : GAME.catchPlusOneMs
  const plusRise = boosted
    ? GAME.toothbrushSweepCatchPlusOneRisePx
    : GAME.catchPlusOneRisePx
  const plusScale = boosted
    ? GAME.toothbrushSweepCatchPlusOneScale
    : GAME.catchPlusOneScale
  const sizeBase = boosted ? 9 : 7
  const sizeRange = boosted ? 9 : 7

  const root = document.createElement('div')
  root.className = boosted ? 'catch-fx catch-fx--sweep' : 'catch-fx'
  root.setAttribute('aria-hidden', 'true')
  root.style.left = `${x}px`
  root.style.top = `${y}px`
  root.style.setProperty('--catch-fx-ms', `${fxMs}ms`)
  root.style.setProperty('--catch-plus-ms', `${plusMs}ms`)
  root.style.setProperty('--catch-plus-rise', `${plusRise}px`)
  root.style.setProperty('--catch-plus-scale', String(plusScale))

  // Soft mint/cream ripple — expands + fades; does not block taps.
  const ripple = document.createElement('span')
  ripple.className = 'catch-fx__ripple'
  root.appendChild(ripple)

  const count = Math.max(1, Math.min(56, particleCount))
  const wobble = (Math.random() - 0.5) * 0.35

  for (let i = 0; i < count; i++) {
    const p = document.createElement('span')
    const kind = PARTICLE_KINDS[i % PARTICLE_KINDS.length]!
    const color = PARTICLE_COLORS[i % PARTICLE_COLORS.length]!
    p.className = `catch-fx__p catch-fx__p--${kind}`
    p.style.setProperty('--p-color', color)
    const angle = (Math.PI * 2 * i) / count + wobble
    const dist = spreadPx * (0.62 + Math.random() * 0.38)
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`)
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`)
    p.style.setProperty('--spin', `${Math.round((Math.random() - 0.5) * 220)}deg`)
    p.style.setProperty('--delay', `${Math.floor(Math.random() * 36)}ms`)
    p.style.setProperty('--size', `${sizeBase + Math.floor(Math.random() * sizeRange)}px`)
    root.appendChild(p)
  }

  const plus = document.createElement('span')
  plus.className = 'catch-fx__plus'
  plus.textContent = '+1'
  root.appendChild(plus)

  layer.appendChild(root)

  const life = Math.max(fxMs, plusMs) + 48
  window.setTimeout(() => {
    root.remove()
  }, life)
}
