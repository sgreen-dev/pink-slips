import { describe, expect, it, vi } from 'vitest'
import { reportCrash } from './report.ts'

/**
 * What a crash report carries, and what it must never carry (backlog Q38). The rule the tests
 * hold is that it is fire and forget: a report that fails, or an endpoint that was never set,
 * must not turn one crash into two.
 */

function capture() {
  const calls: { url: string; body: Record<string, unknown> }[] = []
  const fetcher = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return Promise.resolve(new Response('{"ok":true}'))
  })
  return { calls, fetcher: fetcher as unknown as typeof fetch }
}

describe('reporting a crash', () => {
  it('sends the message and the stack to the error route', () => {
    const { calls, fetcher } = capture()
    reportCrash(new Error('the board blew up'), 'at Board', 'https://counter.example', fetcher)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://counter.example/error')
    expect(calls[0]?.body['message']).toBe('the board blew up')
    expect(String(calls[0]?.body['stack'])).toContain('at Board')
  })

  it('names the commit it was built from, so a stack can be read against the code', () => {
    const { calls, fetcher } = capture()
    reportCrash(new Error('x'), '', 'https://counter.example', fetcher)
    expect(typeof calls[0]?.body['commit']).toBe('string')
  })

  it('sends nothing at all when no endpoint was built in', () => {
    const { calls, fetcher } = capture()
    reportCrash(new Error('x'), '', null, fetcher)
    expect(calls).toHaveLength(0)
  })

  it('says something useful when what was thrown is not an Error', () => {
    const { calls, fetcher } = capture()
    reportCrash('a string was thrown', '', 'https://counter.example', fetcher)
    expect(calls[0]?.body['message']).toBe('a string was thrown')
  })

  it('swallows a failing send rather than throwing out of a crash handler', () => {
    const fetcher = (() => {
      throw new Error('blocked')
    }) as unknown as typeof fetch
    expect(() => reportCrash(new Error('x'), '', 'https://counter.example', fetcher)).not.toThrow()
  })

  it('swallows a rejected send the same way', async () => {
    const fetcher = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    expect(() => reportCrash(new Error('x'), '', 'https://counter.example', fetcher)).not.toThrow()
    await Promise.resolve()
  })
})
