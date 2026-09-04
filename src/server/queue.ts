import { TUNABLES } from '../engine/index.ts'

/**
 * Matchmaking (DESIGN.md 13): who plays whom. The queue itself is whatever sockets are
 * waiting; this module only decides the pair. The two longest-waiting players are matched.
 * Once enough players hold a rating, two players who have both waited less than the wait
 * limit are matched only when their ratings are within the window; a player who has waited
 * longer takes anyone.
 */

export interface Waiting {
  accountId: string
  rating: number
  /** When the player joined the queue, in ms. */
  since: number
}

/** One entry per account, the earliest kept, in waiting order. */
export function dedupe(entries: readonly Waiting[]): Waiting[] {
  const byId = new Map<string, Waiting>()
  for (const entry of entries) {
    const held = byId.get(entry.accountId)
    if (!held || entry.since < held.since) byId.set(entry.accountId, entry)
  }
  return [...byId.values()].sort((a, b) => a.since - b.since)
}

function compatible(a: Waiting, b: Waiting, now: number, strict: boolean, t: typeof TUNABLES) {
  if (!strict) return true
  const { pairWaitMs, pairWindow } = t.online
  const bothFresh = now - a.since < pairWaitMs && now - b.since < pairWaitMs
  return !bothFresh || Math.abs(a.rating - b.rating) <= pairWindow
}

/**
 * The pair to start now, or null. `ratedCount` is how many accounts hold a rating; below the
 * minimum the window is ignored so a small player base still gets matches.
 */
export function pickPair(
  entries: readonly Waiting[],
  now: number,
  ratedCount: number,
  t: typeof TUNABLES = TUNABLES,
): [Waiting, Waiting] | null {
  const waiting = dedupe(entries)
  const strict = ratedCount > t.online.pairMinRated
  for (let i = 0; i < waiting.length; i++) {
    const first = waiting[i]
    if (!first) continue
    for (let j = i + 1; j < waiting.length; j++) {
      const second = waiting[j]
      if (second && compatible(first, second, now, strict, t)) return [first, second]
    }
  }
  return null
}
