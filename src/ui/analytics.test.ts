// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { count, flush, optedOut, resetForTest, visitorId, VISITOR_KEY } from './analytics.ts'

/**
 * The browser's side of what the game counts (backlog Q40). The rules worth holding are the
 * ones about not counting: a browser that asks not to be tracked gets no id and sends nothing,
 * and a failed send never becomes a broken page.
 */

beforeEach(() => {
  localStorage.clear()
  resetForTest()
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetForTest()
})

describe('a browser that asks not to be tracked', () => {
  it('is recognised by either signal', () => {
    expect(optedOut({ doNotTrack: '1' })).toBe(true)
    expect(optedOut({ doNotTrack: 'yes' })).toBe(true)
    expect(optedOut({ globalPrivacyControl: true })).toBe(true)
  })

  it('is not recognised where neither is set', () => {
    expect(optedOut({})).toBe(false)
    expect(optedOut({ doNotTrack: '0' })).toBe(false)
    expect(optedOut({ doNotTrack: null })).toBe(false)
    expect(optedOut(undefined)).toBe(false)
  })

  it('is given no id at all, so there is nothing to store or send', () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' })
    expect(visitorId()).toBeNull()
    expect(localStorage.getItem(VISITOR_KEY)).toBeNull()
  })

  it('sends nothing, even when something asks to be counted', () => {
    const beacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { doNotTrack: '1', sendBeacon: beacon })
    count('visit')
    flush('https://rooms.example')
    expect(beacon).not.toHaveBeenCalled()
  })
})

describe('the visitor id', () => {
  it('is made once and then kept', () => {
    const first = visitorId()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(visitorId()).toBe(first)
    expect(localStorage.getItem(VISITOR_KEY)).toBe(first)
  })

  it('is replaced when what is stored is not one', () => {
    localStorage.setItem(VISITOR_KEY, 'not-an-id')
    expect(visitorId()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('is null when storage cannot be used, rather than counting every visit as new', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    } as unknown as Storage
    expect(visitorId(broken)).toBeNull()
  })
})

describe('sending', () => {
  it('holds events and sends them together', () => {
    const beacon: (url: string, body?: BodyInit) => boolean = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    count('visit')
    count('match-start-cpu')
    expect(beacon).not.toHaveBeenCalled()
    flush('https://rooms.example')
    expect(beacon).toHaveBeenCalledTimes(1)
    expect(vi.mocked(beacon).mock.calls[0]?.[0]).toBe('https://rooms.example/events')
  })

  it('sends nothing when there is nothing waiting', () => {
    const beacon = vi.fn(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    flush('https://rooms.example')
    expect(beacon).not.toHaveBeenCalled()
  })

  it('swallows a send that throws rather than breaking the page', () => {
    vi.stubGlobal('navigator', {
      sendBeacon: () => {
        throw new Error('blocked')
      },
    })
    count('visit')
    expect(() => flush('https://rooms.example')).not.toThrow()
  })
})

describe('the beacon body', () => {
  it('is sent as text/plain, because a beacon cannot preflight', () => {
    // Any other content type makes this a request the browser wants to preflight, and a beacon
    // cannot, so it would be dropped without a word. The service reads it as JSON regardless.
    let sentType = ''
    const beacon: (url: string, body?: BodyInit) => boolean = vi.fn((_url, body) => {
      const blob = body as Blob
      sentType = blob.type
      return true
    })
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    count('visit')
    flush('https://rooms.example')
    expect(sentType).toBe('text/plain')
  })
})
