export type SheetsCounterType = 'complete' | 'retry'

/** Anonymous TOP3 scores only — no names / PII. */
export type Top3Scores = [number, number, number]

let missingUrlLogged = false

function webhookUrl(): string | undefined {
  const url = import.meta.env.VITE_SHEETS_WEBHOOK_URL
  if (typeof url !== 'string') return undefined
  const trimmed = url.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function postFireAndForget(body: string, url: string): void {
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

  postFireAndForget(JSON.stringify({ type }), url)
}

function parseTop3(data: unknown): Top3Scores | null {
  if (!data || typeof data !== 'object') return null
  const raw = (data as { top3?: unknown }).top3
  if (!Array.isArray(raw) || raw.length < 3) return null
  const nums = raw.slice(0, 3).map((v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  })
  return [nums[0]!, nums[1]!, nums[2]!]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Submit anonymous score for TOP3 (does not bump 완료횟수 — caller logs complete).
 * Sends the score **exactly once** (no-cors / beacon), then GETs TOP3 for display.
 * (Earlier cors+beacon double-post could fill 1~3위 with the same score.)
 */
export async function submitSheetsScore(score: number): Promise<Top3Scores | null> {
  const url = webhookUrl()
  if (!url) return null

  const value = Math.max(0, Math.floor(Number(score) || 0))
  const body = JSON.stringify({ type: 'score', value })

  // Single write only — do not also cors-POST (GAS redirects made that path
  // look like a failure and triggered a second write).
  postFireAndForget(body, url)
  await delay(450)
  return fetchSheetsTop3()
}

/**
 * Fetch anonymous TOP3 [s1,s2,s3]. GET ?type=top3 (fallback POST { type: 'top3' }).
 * Returns null on fail / unset URL — UI should hide the block.
 */
export async function fetchSheetsTop3(): Promise<Top3Scores | null> {
  const url = webhookUrl()
  if (!url) return null

  const getUrl = `${url}${url.includes('?') ? '&' : '?'}type=top3`

  try {
    const res = await fetch(getUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
    })
    if (res.ok) {
      const data: unknown = await res.json()
      const top3 = parseTop3(data)
      if (top3) return top3
    }
  } catch {
    // try POST fallback
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ type: 'top3' }),
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    return parseTop3(data)
  } catch {
    return null
  }
}
