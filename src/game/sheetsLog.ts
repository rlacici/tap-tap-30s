export type SheetsCounterType = 'complete' | 'retry'

/** Anonymous TOP3 scores only — no names / PII. */
export type Top3Scores = [number, number, number]

const TOP3_CACHE_KEY = 'tap-tap-30s:top3'

let missingUrlLogged = false
/** In-memory fallback when sessionStorage is unavailable. */
let memoryTop3: Top3Scores | null = null

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

function normalizeTop3(raw: unknown[]): Top3Scores | null {
  if (raw.length < 3) return null
  const nums = raw.slice(0, 3).map((v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
  })
  return [nums[0]!, nums[1]!, nums[2]!]
}

function parseTop3(data: unknown): Top3Scores | null {
  if (!data || typeof data !== 'object') return null
  const raw = (data as { top3?: unknown }).top3
  if (!Array.isArray(raw)) return null
  return normalizeTop3(raw)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/** Last fetched / known TOP3 for optimistic result UI. */
export function getCachedTop3(): Top3Scores | null {
  if (memoryTop3) return memoryTop3
  try {
    const raw = sessionStorage.getItem(TOP3_CACHE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const top3 = normalizeTop3(parsed)
    if (top3) memoryTop3 = top3
    return top3
  } catch {
    return null
  }
}

export function setCachedTop3(top3: Top3Scores): void {
  memoryTop3 = top3
  try {
    sessionStorage.setItem(TOP3_CACHE_KEY, JSON.stringify(top3))
  } catch {
    // Private mode / quota — memory cache still works this session.
  }
}

/**
 * Insert the just-finished score into a cached TOP3 (desc, keep 3).
 * If no cache: [score, 0, 0] when score > 0, else [0, 0, 0].
 * Example: merge(62, [80,70,60]) → [80,70,62] (62 replaces 3rd).
 */
export function mergeOptimisticTop3(
  score: number,
  cached: Top3Scores | null,
): Top3Scores {
  const value = Math.max(0, Math.floor(Number(score) || 0))
  if (value <= 0) {
    return cached ?? [0, 0, 0]
  }
  const base = cached ?? [0, 0, 0]
  const merged = [...base, value]
    .filter((n) => n > 0)
    .sort((a, b) => b - a)
    .slice(0, 3)
  while (merged.length < 3) merged.push(0)
  return [merged[0]!, merged[1]!, merged[2]!]
}

function top3Equals(a: Top3Scores, b: Top3Scores): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

export type FetchTop3Options = {
  /**
   * When false, do not write sessionStorage/memory (avoids poisoning the
   * optimistic cache with a pre-write GET during the beacon fallback).
   * Default true — successful reads are server truth, including [0,0,0].
   */
  persist?: boolean
}

/**
 * Submit anonymous score for TOP3 (does not bump 완료횟수 — caller logs complete).
 *
 * **Primary:** one cors `POST { type:score }` and use the JSON `top3` from that
 * same response. Apps Script applies the score under LockService and returns the
 * updated board — no separate GET, so no write/read race (the old beacon→GET
 * path could still paint [80,70,60] after a 62 write for hundreds of ms).
 *
 * **Do not** also sendBeacon on the cors success path (that double-inserted the
 * same score into 1~3위). Beacon+GET is fallback only when cors fails entirely.
 *
 * Does **not** gate the result UI — caller paints optimistic TOP3 first.
 * Caller should still merge the current score into a fallback fetch for display.
 */
export async function submitSheetsScore(score: number): Promise<Top3Scores | null> {
  const url = webhookUrl()
  if (!url) return null

  const value = Math.max(0, Math.floor(Number(score) || 0))
  const body = JSON.stringify({ type: 'score', value })

  // Primary: awaitable cors POST. Browser fetch follows the GAS redirect and
  // returns { ok, type:'score', top3 } — board AFTER this write under the lock.
  try {
    const res = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
    })
    if (res.ok) {
      const data: unknown = await res.json()
      const top3 = parseTop3(data)
      if (top3) {
        setCachedTop3(top3)
        return top3
      }
      // Request likely applied; read board without a second score write.
      return await fetchSheetsTop3()
    }
  } catch {
    // Network / CORS failure — fall through to beacon + GET.
  }

  // Fallback: single fire-and-forget write, then poll GET until the score is
  // visible on the board (or attempts run out). Do not persist mid-poll fetches.
  postFireAndForget(body, url)
  let top3: Top3Scores | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(attempt === 0 ? 500 : 400)
    const fetched = await fetchSheetsTop3({ persist: false })
    if (!fetched) continue
    top3 = fetched
    if (value <= 0 || top3Equals(mergeOptimisticTop3(value, fetched), fetched)) {
      break
    }
  }
  if (top3) setCachedTop3(top3)
  return top3
}

/**
 * Fetch anonymous TOP3 [s1,s2,s3]. GET ?type=top3 (fallback POST { type: 'top3' }).
 * On success with persist (default), **always** replaces the session cache —
 * including [0,0,0] after a sheet clear — so stale optimistic values cannot win
 * over server truth. Returns null on fail / unset URL.
 */
export async function fetchSheetsTop3(
  opts?: FetchTop3Options,
): Promise<Top3Scores | null> {
  const url = webhookUrl()
  if (!url) return null
  const persist = opts?.persist !== false

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
      if (top3) {
        // Server truth wins — zeros clear old 67/64 from sessionStorage/memory.
        if (persist) setCachedTop3(top3)
        return top3
      }
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
    const top3 = parseTop3(data)
    if (top3 && persist) setCachedTop3(top3)
    return top3
  } catch {
    return null
  }
}
