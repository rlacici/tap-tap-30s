export type SheetsCounterType = 'complete' | 'retry'

let missingUrlLogged = false

function webhookUrl(): string | undefined {
  const url = import.meta.env.VITE_SHEETS_WEBHOOK_URL
  if (typeof url !== 'string') return undefined
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Fire-and-forget counter bump via Google Apps Script web app.
 * Body: { "type": "complete" } | { "type": "retry" }
 * No-ops quietly when VITE_SHEETS_WEBHOOK_URL is unset.
 */
export function logSheetsEvent(type: SheetsCounterType): void {
  const url = webhookUrl()
  if (!url) {
    if (!missingUrlLogged) {
      missingUrlLogged = true
      console.info(
        '[sheets] VITE_SHEETS_WEBHOOK_URL unset — counter logging disabled',
      )
    }
    return
  }

  const body = JSON.stringify({ type })

  try {
    // text/plain avoids CORS preflight; Apps Script still parses JSON contents.
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' })
      if (navigator.sendBeacon(url, blob)) return
    }
  } catch {
    // fall through to fetch
  }

  try {
    void fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    })
  } catch {
    // Swallow — logging must never break the game.
  }
}
