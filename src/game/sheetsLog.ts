export type SheetsCounterType = 'complete' | 'retry'

/** Anonymous TOP3 scores only — no names / PII. */
export type Top3Scores = [number, number, number]

/**
 * Result of submitting a score for TOP3.
 * When `trustServer` is true, the board came from the score POST under
 * LockService — callers must paint it as-is (no re-merge). Policy:
 * **strictly greater only** — equal scores do not take a new slot
 * (e.g. [10,5,3]+10 → [10,5,3], never [10,10,5] or [10,10,10]).
 */
export type SubmitScoreResult = {
  top3: Top3Scores
  /** Authoritative post-write board from score POST JSON. */
  trustServer: boolean
}

const TOP3_CACHE_KEY = 'tap-tap-30s:top3'

let missingUrlLogged = false
/** In-memory fallback when sessionStorage is unavailable. */
let memoryTop3: Top3Scores | null = null
/**
 * Monotonic seq for cache writes. Newer authoritative (score POST) wins;
 * older non-authoritative fetches are ignored to reduce multi-player flicker.
 */
let top3CacheSeq = 0

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

export type SetCachedTop3Options = {
  /**
   * When true, always wins over in-flight older GETs (score POST board).
   * Advances the cache seq so late prefetches/GETs are dropped.
   */
  authoritative?: boolean
  /**
   * Seq captured before an async fetch. Persist only if still equal to
   * `currentTop3CacheSeq()` (nothing newer wrote while in flight).
   */
  expectSeq?: number
}

/**
 * Persist TOP3 to memory + sessionStorage.
 * Out-of-order non-authoritative writes are dropped when `expectSeq` no
 * longer matches (late prefetch / multi-player GET must not clobber fresher).
 */
export function setCachedTop3(
  top3: Top3Scores,
  opts?: SetCachedTop3Options,
): boolean {
  const authoritative = opts?.authoritative === true
  if (!authoritative && opts?.expectSeq != null && opts.expectSeq !== top3CacheSeq) {
    return false
  }
  if (authoritative) {
    top3CacheSeq += 1
  } else if (opts?.expectSeq != null) {
    top3CacheSeq = opts.expectSeq + 1
  } else {
    top3CacheSeq += 1
  }
  memoryTop3 = top3
  try {
    sessionStorage.setItem(TOP3_CACHE_KEY, JSON.stringify(top3))
  } catch {
    // Private mode / quota — memory cache still works this session.
  }
  return true
}

/** Bump cache generation so in-flight prefetches cannot overwrite newer truth. */
export function bumpTop3CacheSeq(): number {
  return ++top3CacheSeq
}

export function currentTop3CacheSeq(): number {
  return top3CacheSeq
}

/**
 * Dedupe positive scores, sort desc, keep 3, pad with 0.
 * Cleans abnormal boards like [10,10,10] → [10,0,0] or [10,10,5] → [10,5,0].
 */
export function uniqueTop3(scores: readonly number[]): Top3Scores {
  const seen = new Set<number>()
  const out: number[] = []
  for (const raw of scores) {
    const n = Math.floor(Number(raw) || 0)
    if (n <= 0 || seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  out.sort((a, b) => b - a)
  const sliced = out.slice(0, 3)
  while (sliced.length < 3) sliced.push(0)
  return [sliced[0]!, sliced[1]!, sliced[2]!]
}

/**
 * Insert the just-finished score into a cached TOP3 (desc, keep 3).
 * **Strictly greater only:** if `score` is already on the board, do not
 * insert again (equals do not take a new slot / push anyone out).
 * Always dedupes the baseline first (cleans [10,10,10] etc.).
 *
 * Examples:
 *   merge(10, [10,5,3]) → [10,5,3]   (equal — no insert)
 *   merge(11, [10,5,3]) → [11,10,5]
 *   merge(62, [80,70,60]) → [80,70,62]
 *   merge(10, [10,10,10]) → [10,0,0] (dedupe cleanup)
 *
 * Safe to call on a post-write board that already includes this play —
 * equals are a no-op (no [21,21,20] double insert). Prefer trustServer
 * POST top3 as-is after Apps Script redeploy; use ensure for beacon/GET.
 */
export function mergeOptimisticTop3(
  score: number,
  cached: Top3Scores | null,
): Top3Scores {
  const value = Math.max(0, Math.floor(Number(score) || 0))
  const base = uniqueTop3(cached ?? [0, 0, 0])
  if (value <= 0) return base
  // Equal already present — stay; do not push out a lower unique score.
  if (base[0] === value || base[1] === value || base[2] === value) {
    return base
  }
  return uniqueTop3([...base, value])
}

function top3Equals(a: Top3Scores, b: Top3Scores): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]
}

/**
 * True when applying `score` would not change the (deduped) board —
 * equal already present, or too low to enter after unique sort.
 * Used by beacon poll settlement; prefer score-POST `trustServer`.
 */
export function top3ReflectsScore(
  score: number,
  board: Top3Scores,
): boolean {
  const value = Math.max(0, Math.floor(Number(score) || 0))
  if (value <= 0) return true
  return top3Equals(mergeOptimisticTop3(value, board), uniqueTop3(board))
}

/**
 * Apply strictly-greater merge (and dedupe). Safe on post-write boards.
 * For beacon / stale GET coalesce — not required for trustServer POST top3.
 */
export function ensureScoreInTop3(
  score: number,
  board: Top3Scores | null,
): Top3Scores {
  return mergeOptimisticTop3(score, board)
}

export type FetchTop3Options = {
  /**
   * When false, do not write sessionStorage/memory (avoids poisoning the
   * optimistic cache with a pre-write GET during the beacon fallback).
   * Default true — successful reads are server truth, including [0,0,0].
   */
  persist?: boolean
  /**
   * Seq from `currentTop3CacheSeq()` before await. If anything newer wrote
   * while in flight, persist is skipped.
   */
  expectSeq?: number
}

/**
 * Submit anonymous score for TOP3 (does not bump 완료횟수 — caller logs complete).
 *
 * **Primary:** one cors `POST { type:score }` and use the JSON `top3` from that
 * same response (`trustServer: true`). Apps Script applies the score under
 * LockService and returns the updated board — no separate GET, so no
 * write/read race. Equal scores do **not** insert (strictly greater only).
 *
 * **Speed:** callers should start this *before* `logSheetsEvent('complete')` so
 * the score POST wins the shared Apps Script lock (complete/score both use it).
 * On `trustServer: true` there is **no** follow-up GET.
 *
 * **Do not** also sendBeacon on the cors success path (that double-inserted the
 * same score into 1~3위). Beacon+GET is fallback only when cors fails entirely
 * (`trustServer: false` — caller may ensureScore for stale GET).
 *
 * Does **not** gate the result UI — caller paints optimistic TOP3 first.
 * On total failure returns null — caller must NOT persist optimistic to cache.
 */
export async function submitSheetsScore(
  score: number,
): Promise<SubmitScoreResult | null> {
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
        // Authoritative — paint ASAP; never issue a follow-up GET.
        setCachedTop3(top3, { authoritative: true })
        return { top3, trustServer: true }
      }
      // Rare: write likely applied but JSON missing top3. One recovery GET only
      // (no second score write). Prefer failing fast over long poll here.
      const fetched = await fetchSheetsTop3({ persist: false })
      if (fetched) {
        setCachedTop3(fetched, { authoritative: false })
        return { top3: fetched, trustServer: false }
      }
      return null
    }
  } catch {
    // Network / CORS failure — fall through to beacon + GET.
  }

  // Fallback: single fire-and-forget write, then poll GET until the score is
  // reflected (or attempts run out). Do not persist mid-poll fetches.
  // With strictly-greater policy, equals already on the board count as reflected.
  // Shorter first wait: cut client idle before the first probe (GAS floor remains).
  postFireAndForget(body, url)
  let top3: Top3Scores | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    await delay(attempt === 0 ? 280 : 320)
    const fetched = await fetchSheetsTop3({ persist: false })
    if (!fetched) continue
    top3 = fetched
    if (value <= 0 || top3ReflectsScore(value, fetched)) {
      break
    }
  }
  if (top3) {
    setCachedTop3(top3, { authoritative: false })
    return { top3, trustServer: false }
  }
  return null
}

/**
 * Fetch anonymous TOP3 [s1,s2,s3]. GET ?type=top3 (fallback POST { type: 'top3' }).
 * On success with persist (default), **always** replaces the session cache —
 * including [0,0,0] after a sheet clear — so stale optimistic values cannot win
 * over server truth. Returns null on fail / unset URL.
 *
 * Pass `expectSeq` from `currentTop3CacheSeq()` before awaiting so a late
 * response cannot overwrite a newer authoritative cache write.
 */
export async function fetchSheetsTop3(
  opts?: FetchTop3Options,
): Promise<Top3Scores | null> {
  const url = webhookUrl()
  if (!url) return null
  const persist = opts?.persist !== false
  const expectSeq = opts?.expectSeq ?? top3CacheSeq

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
        // Skip if a newer write landed while this GET was in flight.
        if (persist) setCachedTop3(top3, { expectSeq })
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
    if (top3 && persist) setCachedTop3(top3, { expectSeq })
    return top3
  } catch {
    return null
  }
}

