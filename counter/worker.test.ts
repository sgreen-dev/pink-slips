import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './worker.ts'

/**
 * The counter is the one worker with no shared logic behind it, so its rules live in the fetch
 * handler and are tested through it: the origin gate on writes, the per-address gap, and the
 * routes. A fake KV stands in for the namespace.
 */

const SITE = 'https://sgreen-dev.github.io'
const URL_ = 'https://counter.example/'

function fakeKv(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    env: {
      COUNTS: {
        get: async (key: string) => data.get(key) ?? null,
        put: async (key: string, value: string) => void data.set(key, value),
      },
    } as unknown as Env,
  }
}

const call = (env: Env, method: string, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(URL_, { method, headers }), env)

const countOf = async (response: Response) => ((await response.json()) as { count: number }).count

describe('the matches counter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives the count to anyone, from any origin', async () => {
    const { env } = fakeKv({ matches: '31' })
    expect(await countOf(await call(env, 'GET'))).toBe(31)
    expect(await countOf(await call(env, 'GET', { Origin: 'https://elsewhere.example' }))).toBe(31)
  })

  it('reads a missing or unreadable count as zero rather than failing', async () => {
    expect(await countOf(await call(fakeKv().env, 'GET'))).toBe(0)
    expect(await countOf(await call(fakeKv({ matches: 'not a number' }).env, 'GET'))).toBe(0)
  })

  it('answers the preflight with no body', async () => {
    const response = await call(fakeKv().env, 'OPTIONS', { Origin: SITE })
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
  })

  it('echoes an allowed origin and falls back to the primary one otherwise', async () => {
    const { env } = fakeKv()
    const mine = await call(env, 'GET', { Origin: 'http://localhost:5173' })
    expect(mine.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
    // A browser rejects a response that does not name its own origin, which is the point.
    const other = await call(env, 'GET', { Origin: 'https://elsewhere.example' })
    expect(other.headers.get('Access-Control-Allow-Origin')).toBe(SITE)
    expect(other.headers.get('Vary')).toBe('Origin')
  })

  it('adds one for a match reported from the game', async () => {
    const { env, data } = fakeKv({ matches: '4' })
    const response = await call(env, 'POST', { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' })
    expect(await countOf(response)).toBe(5)
    expect(data.get('matches')).toBe('5')
  })

  it('refuses a write from an origin that is not the game', async () => {
    const { env, data } = fakeKv({ matches: '4' })
    const response = await call(env, 'POST', { Origin: 'https://elsewhere.example' })
    expect(response.status).toBe(403)
    expect(data.get('matches')).toBe('4')
  })

  it('counts one address at most once every ten seconds', async () => {
    const { env, data } = fakeKv({ matches: '0' })
    const post = () => call(env, 'POST', { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' })
    expect(await countOf(await post())).toBe(1)
    // Inside the gap: answered with the count, not an error, and nothing added.
    vi.setSystemTime(1_005_000)
    expect(await countOf(await post())).toBe(1)
    expect(data.get('matches')).toBe('1')
    // Past it: counted again.
    vi.setSystemTime(1_011_000)
    expect(await countOf(await post())).toBe(2)
  })

  it('keeps the gap per address, so two players racing both count', async () => {
    const { env } = fakeKv({ matches: '0' })
    const from = (ip: string) => call(env, 'POST', { Origin: SITE, 'CF-Connecting-IP': ip })
    expect(await countOf(await from('1.2.3.4'))).toBe(1)
    expect(await countOf(await from('5.6.7.8'))).toBe(2)
  })

  it('says which commit it was deployed from, without touching the count', async () => {
    // The deploy check reads this to tell a stale worker from a current one (backlog Q36).
    const { env, data } = fakeKv({ matches: '7' })
    const withCommit = { ...env, COMMIT: 'abc1234' } as Env
    const response = await worker.fetch(new Request(`${URL_}version`), withCommit)
    expect(await response.json()).toEqual({ commit: 'abc1234' })
    expect(data.get('matches')).toBe('7')
  })

  it('says the commit is unknown when it was deployed without one', async () => {
    const response = await worker.fetch(new Request(`${URL_}version`), fakeKv().env)
    expect(await response.json()).toEqual({ commit: 'unknown' })
  })

  it('records a crash, keeping only what finds the bug', async () => {
    const { env, data } = fakeKv()
    const response = await worker.fetch(
      new Request(`${URL_}error`, {
        method: 'POST',
        headers: { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' },
        body: JSON.stringify({
          message: 'the board blew up',
          stack: 'at Board',
          commit: 'abc1234',
        }),
      }),
      env,
    )
    expect(response.status).toBe(200)
    const stored = JSON.parse(data.get('errors') ?? '[]') as { message: string; commit: string }[]
    expect(stored).toHaveLength(1)
    expect(stored[0]?.message).toBe('the board blew up')
    expect(stored[0]?.commit).toBe('abc1234')
  })

  it('refuses a report from an origin that is not the game', async () => {
    const { env, data } = fakeKv()
    const response = await worker.fetch(
      new Request(`${URL_}error`, {
        method: 'POST',
        headers: { Origin: 'https://elsewhere.example' },
        body: JSON.stringify({ message: 'x' }),
      }),
      env,
    )
    expect(response.status).toBe(403)
    expect(data.get('errors')).toBeUndefined()
  })

  it('keeps only the most recent reports, so one bad day cannot fill the store', async () => {
    const { env, data } = fakeKv()
    for (let i = 0; i < 30; i++) {
      vi.setSystemTime(1_000_000 + i * 20_000)
      await worker.fetch(
        new Request(`${URL_}error`, {
          method: 'POST',
          headers: { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' },
          body: JSON.stringify({ message: `crash ${i}` }),
        }),
        env,
      )
    }
    const stored = JSON.parse(data.get('errors') ?? '[]') as { message: string }[]
    expect(stored).toHaveLength(25)
    // Newest first, so the last crash is the one at the top.
    expect(stored[0]?.message).toBe('crash 29')
  })

  it('cuts a huge message and stack down rather than storing them whole', async () => {
    const { env, data } = fakeKv()
    await worker.fetch(
      new Request(`${URL_}error`, {
        method: 'POST',
        headers: { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' },
        body: JSON.stringify({ message: 'm'.repeat(5000), stack: 's'.repeat(50_000) }),
      }),
      env,
    )
    const stored = JSON.parse(data.get('errors') ?? '[]') as { message: string; stack: string }[]
    expect(stored[0]?.message.length).toBe(300)
    expect(stored[0]?.stack.length).toBe(2000)
  })

  it('drops a report with no message, and never lets a bad body throw', async () => {
    const { env, data } = fakeKv()
    const send = (body: string) =>
      worker.fetch(
        new Request(`${URL_}error`, {
          method: 'POST',
          headers: { Origin: SITE, 'CF-Connecting-IP': '9.9.9.9' },
          body,
        }),
        env,
      )
    expect((await send('not json at all')).status).toBe(200)
    vi.setSystemTime(1_100_000)
    expect((await send(JSON.stringify({ stack: 'only a stack' }))).status).toBe(200)
    expect(data.get('errors')).toBeUndefined()
  })

  it('adds a match without disturbing the crash reports, and the other way round', async () => {
    // The two share a namespace but not a gap, so one must never crowd the other out.
    const { env, data } = fakeKv({ matches: '4' })
    const head = { Origin: SITE, 'CF-Connecting-IP': '1.2.3.4' }
    await worker.fetch(
      new Request(`${URL_}error`, { method: 'POST', headers: head, body: '{"message":"x"}' }),
      env,
    )
    const counted = await worker.fetch(new Request(URL_, { method: 'POST', headers: head }), env)
    expect(await countOf(counted)).toBe(5)
    expect(JSON.parse(data.get('errors') ?? '[]')).toHaveLength(1)
  })

  it('turns away any other method', async () => {
    const response = await call(fakeKv().env, 'DELETE', { Origin: SITE })
    expect(response.status).toBe(405)
  })
})
