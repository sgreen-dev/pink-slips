/**
 * What a room needs to write, and what it can leave alone (backlog P5).
 *
 * The room used to write three things to storage after every seated message: the snapshot, the
 * expiry, and the alarm. Only the snapshot actually changes that often. The expiry is always a
 * day out, so it moves by however long the gap between two messages was — seconds, usually —
 * and the alarm follows the expiry whenever no turn clock is running. Rewriting either for a
 * few seconds of drift buys nothing, so the expiry is rounded down to the minute and both are
 * written only when the rounded value moves.
 *
 * A turn clock deadline is compared exactly, since that is the one the alarm has to be right
 * about, and it never lands on the same value twice.
 *
 * The room object keeps what it last wrote in memory. After hibernation that is gone, and the
 * first write afterwards simply writes everything again, which is correct and costs one write.
 */

/** How coarse the stored expiry is. A day-long expiry does not care about the odd minute. */
export const EXPIRY_STEP_MS = 60_000

export interface WrittenRoom {
  expiresAt: number
  alarm: number
}

export interface RoomWritePlan {
  /** The expiry to store, or null to leave the stored one alone. */
  expiresAt: number | null
  /** The alarm to set, or null to leave the armed one alone. */
  alarm: number | null
  /** What to remember as written, to pass back in as `written` next time. */
  next: WrittenRoom
}

/**
 * `now` is the current time, `ttlMs` how long a room lives after its last message, and
 * `deadline` the turn clock's alarm time, or null when no clock is running.
 */
export function planRoomWrite(
  written: WrittenRoom | null,
  now: number,
  ttlMs: number,
  deadline: number | null,
): RoomWritePlan {
  const expiresAt = Math.floor((now + ttlMs) / EXPIRY_STEP_MS) * EXPIRY_STEP_MS
  const alarm = deadline === null ? expiresAt : Math.min(expiresAt, deadline)
  return {
    expiresAt: written && written.expiresAt === expiresAt ? null : expiresAt,
    alarm: written && written.alarm === alarm ? null : alarm,
    next: { expiresAt, alarm },
  }
}
