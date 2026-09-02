import { describe, expect, it } from 'vitest'
import { counterEndpoint, readMatchCount, recordMatch } from './counter.ts'

function fakeFetch(handler: (method: string) => Response | Promise<Response>) {
  const calls: string[] = []
  const fetcher = async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push(method)
    return handler(method)
  }
  return { fetcher, calls }
}

const ok = (count: unknown) =>
  new Response(JSON.stringify({ count }), { headers: { 'Content-Type': 'application/json' } })

describe('matches-played counter', () => {
  it('is off without an endpoint and makes no request', async () => {
    expect(counterEndpoint()).toBeNull()
    const { fetcher, calls } = fakeFetch(() => ok(5))
    expect(await readMatchCount(null, fetcher)).toBeNull()
    expect(await recordMatch(null, fetcher)).toBeNull()
    expect(calls).toEqual([])
  })

  it('reads the count and posts one increment', async () => {
    let count = 41
    const { fetcher, calls } = fakeFetch((method) => ok(method === 'POST' ? ++count : count))
    expect(await readMatchCount('https://counter.example/matches', fetcher)).toBe(41)
    expect(await recordMatch('https://counter.example/matches', fetcher)).toBe(42)
    expect(calls).toEqual(['GET', 'POST'])
  })

  it('turns failures and bad payloads into null', async () => {
    const failing = fakeFetch(() => {
      throw new Error('offline')
    })
    expect(await readMatchCount('https://counter.example/matches', failing.fetcher)).toBeNull()
    const notOk = fakeFetch(() => new Response('nope', { status: 500 }))
    expect(await readMatchCount('https://counter.example/matches', notOk.fetcher)).toBeNull()
    const junk = fakeFetch(() => ok('many'))
    expect(await recordMatch('https://counter.example/matches', junk.fetcher)).toBeNull()
  })
})
