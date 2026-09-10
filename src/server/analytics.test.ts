import { describe, expect, it } from 'vitest'
import {
  dayKey,
  EVENTS,
  isEventName,
  isVisitorId,
  MAX_EVENTS_PER_BATCH,
  parseBatch,
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
