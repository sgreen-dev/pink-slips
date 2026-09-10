import { roomEndpoint } from './roomLink.ts'
import type { EventName } from '../server/analytics.ts'

/**
 * What the game counts, from the browser's side (backlog Q40). There is no third-party script
 * here and there never should be: it would be the first runtime dependency after React, it
 * would need the content policy opened up, and it would hand a player's behaviour to somebody
 * else. This sends a fixed list of event names and one random id, to the game's own service.
 *
 * Three rules it keeps:
 *
 * - **A browser that asks not to be tracked is not.** Do Not Track and Global Privacy Control
 *   are both read, and when either is set nothing is stored, no id is made, and no request is
 *   sent at all.
 * - **The id identifies a browser, not a person.** It is random, it is made here, it is never
 *   joined to an account or a name, and clearing site data ends it.
 * - **Sending is fire and forget.** A blocked or failed send is swallowed, and the game never
 *   waits on one.
 */

export const VISITOR_KEY = 'pink-slips.visitor.v1'

/** How long events are held before being sent, so a session is a few requests rather than many. */
const FLUSH_MS = 20_000

interface Signals {
  doNotTrack?: string | null
  globalPrivacyControl?: boolean
}

/** Whether this browser has asked not to be tracked, by either of the two signals for it. */
export function optedOut(navigatorLike: Signals | undefined = navigatorSignals()): boolean {
  if (!navigatorLike) return false
  if (navigatorLike.globalPrivacyControl === true) return true
  const dnt = navigatorLike.doNotTrack
  return dnt === '1' || dnt === 'yes'
}

function navigatorSignals(): Signals | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as unknown as Signals)
}

/**
 * The id for this browser, made on first use. Null when the browser opted out, or when storage
 * is unavailable, in which case nothing is counted rather than counting every visit as new.
 */
export function visitorId(store: Storage | undefined = safeStorage()): string | null {
  if (optedOut() || !store) return null
  try {
    const held = store.getItem(VISITOR_KEY)
    if (held && /^[0-9a-f]{32}$/.test(held)) return held
    const made = crypto.randomUUID().replace(/-/g, '')
    store.setItem(VISITOR_KEY, made)
    return made
  } catch {
    return null
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

let queue: EventName[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let started = false

/** Notes one thing that happened. Held for a moment, then sent with whatever else happened. */
export function count(name: EventName): void {
  if (optedOut()) return
  queue.push(name)
  start()
  if (timer === null) timer = setTimeout(flush, FLUSH_MS)
}

/**
 * Sends whatever is waiting. Called on a timer, and when the page goes away. The endpoint is a
 * parameter so a test can send somewhere, the way `reportCrash` takes one.
 */
export function flush(endpoint: string | null = roomEndpoint()): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  const events = queue
  queue = []
  if (events.length === 0) return
  const visitor = visitorId()
  if (!endpoint || !visitor) return
  const body = JSON.stringify({ visitor, events })
  try {
    // A beacon still goes out when the page is closing, which a fetch may not. It is sent as
    // text/plain on purpose: any other content type makes it a request the browser wants to
    // preflight, and a beacon cannot preflight, so it would be dropped without a word. The
    // service reads the body as JSON whatever the type says.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(`${endpoint}/events`, new Blob([body], { type: 'text/plain' }))
      return
    }
    void fetch(`${endpoint}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // Counting must never be the thing that breaks a page.
  }
}

/** Sends what is waiting when the page is hidden, which on a phone is how it usually ends. */
function start(): void {
  if (started || typeof document === 'undefined') return
  started = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
}

/** For tests, so one does not leak into the next. */
export function resetForTest(): void {
  queue = []
  if (timer !== null) clearTimeout(timer)
  timer = null
  started = false
}
