/**
 * What the game counts, and what it refuses to (backlog Q40). The storage is in
 * `server/analytics.ts`; everything here is the part worth testing on its own.
 *
 * The rules this holds to, which are the whole point of writing it rather than adding somebody
 * else's script: only a fixed list of event names is accepted, so a browser cannot invent a
 * field and have it stored; the only identifier is a random value the browser made for itself,
 * which is never joined to an account, a name or an address; and nothing is stored per visit
 * beyond the day it happened on.
 *
 * A visitor id counts **browsers**, not people. Clearing storage, a private window or a second
 * device each read as new, and a shared laptop reads as one. Every number here is browsers.
 */

/** Every event the service will store. Anything else sent is dropped without comment. */
export const EVENTS = [
  'visit',
  'screen-phone',
  'screen-desktop',
  'match-start-cpu',
  'match-start-hotseat',
  'match-start-online',
  'match-finish-cpu',
  'match-finish-hotseat',
  'match-finish-online',
  'builder-opened',
  'collection-opened',
  'pack-opened',
  'lap-taken',
  'room-made',
  'sound-on',
] as const

export type EventName = (typeof EVENTS)[number]

const NAMES: ReadonlySet<string> = new Set(EVENTS)

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && NAMES.has(value)
}

/** A visitor id as the browser makes it: 32 hex characters, the shape of a UUID without dashes. */
export function isVisitorId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
}

/** The day an event is filed under, in UTC so a report never depends on where it is read. */
export function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/** How many events one browser may file in one send, so a loop cannot fill the table. */
export const MAX_EVENTS_PER_BATCH = 24

/**
 * How many browsers one day may hold (backlog S17). The service cannot tell a browser from a
 * script inventing a fresh id per request, and it will not look at an address to try, because the
 * game promises players an address is never stored and this is where that promise is kept. So a
 * day is refused once it is full, rather than a sender: a loop can fill a day and no more, and
 * with rows dropped after `KEEP_DAYS` the tables cannot outgrow this many rows a day for that many
 * days. The number is far above anything this game sees, so a day that reads exactly this was
 * cut short, and that is the tell.
 */
export const MAX_BROWSERS_PER_DAY = 2_000

/** Days a row is kept. Every report window fits inside it, so nothing a report reads is dropped. */
export const KEEP_DAYS = 400

/** How often the kept rows are pruned. */
export const PRUNE_EVERY_MS = 86_400_000

/**
 * Whether a batch from this browser may be filed today. A browser already counted today is always
 * let through, so a full day still counts what its browsers do; a new one gets in only while the
 * day has room.
 */
export function admitsBrowser(browsersToday: number, alreadySeen: boolean): boolean {
  return alreadySeen || browsersToday < MAX_BROWSERS_PER_DAY
}

/** The first day a prune at `now` keeps: everything filed on an earlier day is dropped. */
export function pruneCutoff(now: number): string {
  return dayKey(now - KEEP_DAYS * 86_400_000)
}

export interface Batch {
  visitor: string
  events: EventName[]
}

/**
 * A batch from a browser, or null when there is nothing usable in it. Unknown names are dropped
 * rather than refused, so an older page sending an event this build no longer knows still
 * files the ones it does.
 */
export function parseBatch(body: unknown): Batch | null {
  if (typeof body !== 'object' || body === null) return null
  const record = body as Record<string, unknown>
  const visitor = record['visitor']
  if (!isVisitorId(visitor)) return null
  const raw = record['events']
  if (!Array.isArray(raw)) return null
  const events = raw.filter(isEventName).slice(0, MAX_EVENTS_PER_BATCH)
  return events.length === 0 ? null : { visitor, events }
}

export interface DayCounts {
  day: string
  /** Browsers seen that day. */
  visitors: number
  /** Of those, the ones seen for the first time. */
  newVisitors: number
  events: Record<string, number>
}

export interface Report {
  days: DayCounts[]
  /** Browsers seen in the last 1, 7 and 30 days. */
  actives: { day: number; week: number; month: number }
  /** Browsers seen on more than one day, as a share of all of them. */
  returningShare: number
}
