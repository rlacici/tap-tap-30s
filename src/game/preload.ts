import { ASSETS } from './config'
import {
  preloadMouthBackground,
  resetMouthBackgroundPreload,
  whenMouthBackgroundReady,
} from './mouth'

const imageReady = new Map<string, Promise<void>>()

const CRITICAL_IMAGE_URLS = [
  ASSETS.mouthBoard,
  ASSETS.germHero,
  ASSETS.germ,
  ASSETS.toothbrush,
  ASSETS.michuholMarkHud,
] as const

/** Load + ideally decode one image URL (safe to call multiple times). Rejects on failure. */
export function preloadImage(src: string): Promise<void> {
  const existing = imageReady.get(src)
  if (existing) return existing

  const ready = new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    const onLoad = (): void => {
      const decoded = img.decode?.()
      if (decoded) {
        decoded.then(() => resolve()).catch(() => resolve())
      } else {
        resolve()
      }
    }
    img.onload = onLoad
    img.onerror = () => {
      imageReady.delete(src)
      reject(new Error(`Failed to load ${src}`))
    }
    img.src = src
    if (img.complete && img.naturalWidth > 0) onLoad()
  })

  imageReady.set(src, ready)
  return ready
}

/** Kick off start-hero germ fetch ASAP (safe to call multiple times). */
export function preloadGermHero(): Promise<void> {
  return preloadImage(ASSETS.germHero)
}

/** Full in-game germ art. */
export function preloadGermArt(): Promise<void> {
  return preloadImage(ASSETS.germ)
}

/** Toothbrush bonus art (pick-up + sweep). */
export function preloadToothbrushArt(): Promise<void> {
  return preloadImage(ASSETS.toothbrush)
}

/** Compact HUD Michuhol mark. */
export function preloadMichuholMark(): Promise<void> {
  return preloadImage(ASSETS.michuholMarkHud)
}

export function whenGermHeroReady(): Promise<void> {
  return preloadGermHero()
}

/**
 * Critical start/play assets: mouth BG, germ hero, germ, toothbrush, HUD mark.
 * Rejects if any required image fails (start stays gated).
 */
export function preloadCriticalAssets(): Promise<void> {
  return Promise.all([
    preloadMouthBackground(),
    preloadGermHero(),
    preloadGermArt(),
    preloadToothbrushArt(),
    preloadMichuholMark(),
  ]).then(() => undefined)
}

/** Await critical assets (kicks preload if not started). */
export function whenCriticalAssetsReady(): Promise<void> {
  return preloadCriticalAssets()
}

/** Drop cached failures and reload the critical set (start-screen retry). */
export function retryCriticalAssets(): Promise<void> {
  resetMouthBackgroundPreload()
  for (const src of CRITICAL_IMAGE_URLS) {
    imageReady.delete(src)
  }
  return preloadCriticalAssets()
}

export { whenMouthBackgroundReady }
