/**
 * How many messages one socket may send a room (backlog S20). Every message costs the room object
 * a pass through the match and, when it changes anything, a write, so a client that sends as fast
 * as it can is a cost with no ceiling. Each socket carries a budget instead: a burst it may spend
 * at once, refilled one message at a time. Both are far above anything a player's hands can do,
 * so play never meets them. They are service limits, not rules, so they live here and not in the
 * tunables.
 */

/** Messages a socket may send at once. */
export const MESSAGE_BURST = 30

/** How long a socket waits to earn one message back, in ms: five a second, sustained. */
export const MESSAGE_REFILL_MS = 200

export interface Budget {
  /** Messages the socket may still send now. */
  left: number
  /** When `left` was worked out, in ms. */
  at: number
}

/**
 * Spends one message from a socket's budget, or refuses when there is none left. A socket with no
 * budget yet starts with a full one. Time is credited in whole messages and the rest of a refill
 * carries over; a full budget earns nothing more by waiting, and a clock that runs backwards
 * earns nothing at all.
 */
export function spend(
  budget: Budget | undefined,
  now: number,
): { allowed: boolean; budget: Budget } {
  if (!budget) return { allowed: true, budget: { left: MESSAGE_BURST - 1, at: now } }
  const earned = Math.floor(Math.max(0, now - budget.at) / MESSAGE_REFILL_MS)
  const left = Math.min(MESSAGE_BURST, budget.left + earned)
  const at = left === MESSAGE_BURST ? now : budget.at + earned * MESSAGE_REFILL_MS
  return left > 0
    ? { allowed: true, budget: { left: left - 1, at } }
    : { allowed: false, budget: { left, at } }
}
