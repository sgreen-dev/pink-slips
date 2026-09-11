import { describe, expect, it } from 'vitest'
import {
  admitsBrowser,
  dayKey,
  EVENTS,
  isEventName,
  isVisitorId,
  KEEP_DAYS,
  MAX_BROWSERS_PER_DAY,
  MAX_EVENTS_PER_BATCH,
  parseBatch,
  pruneCutoff,
} from './analytics.ts'

/**
 * What the service will and will not store (backlog Q40). The point of these is the refusals:
 * a browser can send anything, and only a fixed list of names and one random id may be kept.
 */

const ID = 'a'.repeat(32)

describe('what counts as an event', () => {
  it('accepts every name on the list and nothing else', () => {
    for (const name of EVENTS) expect(isEventName(name)).toBe(true)
    expect(isEventName('visit ')).toBe(false)
    expect(isEventName('anything-else')).toBe(false)
    expect(isEventName(7)).toBe(false)
    expect(isEventName(null)).toBe(false)
  })
})

describe('a visitor id', () => {
  it('is 32 hex characters, and nothing else is one', () => {
    expect(isVisitorId(ID)).toBe(true)
    expect(isVisitorId('A'.repeat(32))).toBe(false)
    expect(isVisitorId('a'.repeat(31))).toBe(false)
    expect(isVisitorId('a'.repeat(33))).toBe(false)
    expect(isVisitorId('')).toBe(false)
    expect(isVisitorId(undefined)).toBe(false)
  })

  it('refuses anything shaped like an account id or an address', () => {
    // Nothing that identifies a person may ever arrive here and be stored as an id.
    expect(isVisitorId('ann@example.com')).toBe(false)
    expect(isVisitorId('192.168.0.1')).toBe(false)
  })
})

describe('the day an event is filed under', () => {
  it('is the UTC date, so a report does not depend on where it is read', () => {
    expect(dayKey(Date.UTC(2026, 8, 9, 23, 59, 59))).toBe('2026-09-09')
    expect(dayKey(Date.UTC(2026, 8, 10, 0, 0, 1))).toBe('2026-09-10')
  })
})

describe('a batch from a browser', () => {
  it('takes a well-formed one', () => {
    expect(parseBatch({ visitor: ID, events: ['visit', 'pack-opened'] })).toEqual({
      visitor: ID,
      events: ['visit', 'pack-opened'],
    })
  })

  it('drops names it does not know rather than refusing the whole batch', () => {
    // An older page may send an event this build no longer has; the rest still counts.
    expect(parseBatch({ visitor: ID, events: ['visit', 'made-up', 'lap-taken'] })).toEqual({
      visitor: ID,
      events: ['visit', 'lap-taken'],
    })
  })

  it('refuses a batch with no usable id', () => {
    expect(parseBatch({ visitor: 'nope', events: ['visit'] })).toBeNull()
    expect(parseBatch({ events: ['visit'] })).toBeNull()
  })

  it('refuses a batch with nothing left in it', () => {
    expect(parseBatch({ visitor: ID, events: [] })).toBeNull()
    expect(parseBatch({ visitor: ID, events: ['made-up'] })).toBeNull()
    expect(parseBatch({ visitor: ID, events: 'visit' })).toBeNull()
  })

  it('refuses anything that is not an object at all', () => {
    for (const body of [null, undefined, 'visit', 7, []]) expect(parseBatch(body)).toBeNull()
  })

  it('caps how many one send may file, so a loop cannot fill the table', () => {
    const many = Array.from({ length: 500 }, () => 'visit' as const)
    expect(parseBatch({ visitor: ID, events: many })?.events).toHaveLength(MAX_EVENTS_PER_BATCH)
  })

  it('keeps nothing a browser adds beyond the two fields it is asked for', () => {
    const batch = parseBatch({ visitor: ID, events: ['visit'], name: 'Ann', ip: '1.2.3.4' })
    expect(batch).toEqual({ visitor: ID, events: ['visit'] })
  })
})

describe('how much a day may hold', () => {
  it('lets new browsers in while the day has room, and none once it is full', () => {
    expect(admitsBrowser(0, false)).toBe(true)
    expect(admitsBrowser(MAX_BROWSERS_PER_DAY - 1, false)).toBe(true)
    expect(admitsBrowser(MAX_BROWSERS_PER_DAY, false)).toBe(false)
  })

  it('always lets a browser already counted today through, so a full day keeps counting', () => {
    expect(admitsBrowser(MAX_BROWSERS_PER_DAY, true)).toBe(true)
    expect(admitsBrowser(MAX_BROWSERS_PER_DAY + 50, true)).toBe(true)
  })
})

describe('what a prune keeps', () => {
  it('keeps exactly KEEP_DAYS of days behind today', () => {
    const now = Date.UTC(2026, 8, 10, 12)
    expect(pruneCutoff(now)).toBe('2025-08-06')
    expect(pruneCutoff(now)).toBe(dayKey(now - KEEP_DAYS * 86_400_000))
  })

  it('never drops a day the widest report can read', () => {
    // The admin report is clamped to KEEP_DAYS, today included, so its oldest day is one later
    // than the cutoff; this is the relationship that makes pruning invisible to the owner.
    for (const hour of [0, 12, 23]) {
      const now = Date.UTC(2026, 8, 10, hour, 59)
      const oldestRead = dayKey(now - (KEEP_DAYS - 1) * 86_400_000)
      expect(pruneCutoff(now) < oldestRead).toBe(true)
    }
  })
})
