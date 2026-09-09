import { describe, expect, it } from 'vitest'
import { EXPIRY_STEP_MS, planRoomWrite, type WrittenRoom } from './roomWrites.ts'

/**
 * The room wrote its snapshot, its expiry and its alarm after every seated message. The
 * snapshot has to be written; the other two rarely change (backlog P5). These pin that a run
 * of quick messages writes them once, that a turn clock still moves the alarm exactly when it
 * should, and that a room woken from hibernation writes everything again.
 */

const DAY = 24 * 60 * 60 * 1000

/** Plays a run of messages through the planner, counting what each one would write. */
function run(times: readonly number[], deadline: (at: number) => number | null) {
  let written: WrittenRoom | null = null
  let expiryWrites = 0
  let alarmWrites = 0
  const alarms: number[] = []
  for (const now of times) {
    const plan = planRoomWrite(written, now, DAY, deadline(now))
    if (plan.expiresAt !== null) expiryWrites++
    if (plan.alarm !== null) {
      alarmWrites++
      alarms.push(plan.alarm)
    }
    written = plan.next
  }
  return { expiryWrites, alarmWrites, alarms }
}

const noClock = () => null

describe('what a room writes', () => {
  it('writes the expiry and the alarm once for a burst of messages inside a minute', () => {
    // Twenty messages a second apart: the old code wrote the expiry and the alarm twenty times.
    const times = Array.from({ length: 20 }, (_, i) => 1_000_000 + i * 1_000)
    expect(run(times, noClock)).toMatchObject({ expiryWrites: 1, alarmWrites: 1 })
  })

  it('writes them again once the rounded expiry moves on', () => {
    const start = 1_000_000
    const times = [start, start + EXPIRY_STEP_MS, start + 2 * EXPIRY_STEP_MS]
    expect(run(times, noClock)).toMatchObject({ expiryWrites: 3, alarmWrites: 3 })
  })

  it('still moves the alarm for every new turn clock deadline', () => {
    // A clock that resets each turn: the alarm has to be right about this one, so it is
    // compared exactly rather than rounded.
    const start = 1_000_000
    const times = [start, start + 1_000, start + 2_000]
    const out = run(times, (at) => at + 45_000)
    expect(out.alarmWrites).toBe(3)
    expect(out.alarms).toEqual([1_045_000, 1_046_000, 1_047_000])
  })

  it('takes the turn clock over the expiry, since it comes first', () => {
    const now = 1_000_000
    const plan = planRoomWrite(null, now, DAY, now + 30_000)
    expect(plan.alarm).toBe(now + 30_000)
  })

  it('falls back to the expiry when no clock is running', () => {
    const now = 1_000_000
    const plan = planRoomWrite(null, now, DAY, null)
    expect(plan.alarm).toBe(plan.expiresAt)
    expect(plan.expiresAt).toBe(Math.floor((now + DAY) / EXPIRY_STEP_MS) * EXPIRY_STEP_MS)
  })

  it('never stores an expiry later than the real one', () => {
    // Rounding down matters: a room may forget itself a minute early, never a minute late.
    for (const now of [0, 1, 59_999, 60_000, 1_234_567]) {
      expect(planRoomWrite(null, now, DAY, null).expiresAt).toBeLessThanOrEqual(now + DAY)
    }
  })

  it('writes everything again after hibernation, when nothing is remembered', () => {
    const now = 1_000_000
    const plan = planRoomWrite(null, now, DAY, null)
    expect(plan.expiresAt).not.toBeNull()
    expect(plan.alarm).not.toBeNull()
  })
})
