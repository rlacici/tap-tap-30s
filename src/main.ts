import './style.css'
import { CavityTapGame } from './game/game'
import { preloadCriticalAssets } from './game/preload'

// Fetch critical images ASAP (before / while game shell mounts).
void preloadCriticalAssets()

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('#app missing')
}

// Avoid stacking game instances on Vite HMR.
app.replaceChildren()

// Lock mobile overscroll / rubber-banding where supported.
document.documentElement.style.touchAction = 'none'
document.body.style.touchAction = 'none'

new CavityTapGame(app)

if (import.meta.hot) {
  import.meta.hot.accept()
}
