import { describe, expect, it } from 'vitest'
import {
  ALLOWED_ORIGINS,
  bearer,
  sameSecret,
  corsHeaders,
  json,
  originAllowed,
  readJson,
  sentFromTheSite,
  text,
} from './http.ts'

/**
 * The HTTP shapes the service answers in. They lived in `server/worker.ts` with the routing and
 * both Durable Objects, where nothing could reach them; they are their own module now and this
 * is their first test (backlog Q37).
 */

const SITE = ALLOWED_ORIGINS[0]!
const from = (origin?: string) =>
  new Request('https://rooms.example/', origin ? { headers: { Origin: origin } } : undefined)

describe('the CORS headers', () => {
  it('echoes an origin the game is served from', () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(corsHeaders(from(origin))['Access-Control-Allow-Origin']).toBe(origin)
    }
  })

  it('answers any other origin with the primary one, which the browser then rejects', () => {
    // Naming the caller's own origin back is what would let any site read the answer.
    expect(corsHeaders(from('https://elsewhere.example'))['Access-Control-Allow-Origin']).toBe(SITE)
    expect(corsHeaders(from())['Access-Control-Allow-Origin']).toBe(SITE)
  })

  it('varies on origin and is never cached', () => {
    const headers = corsHeaders(from(SITE))
    expect(headers['Vary']).toBe('Origin')
    expect(headers['Cache-Control']).toBe('no-store')
  })
})

describe('the origin gate on a socket', () => {
  it('lets the game through, and a script that sends no origin at all', () => {
    expect(originAllowed(from(SITE))).toBe(true)
    // A browser always sends its origin on an upgrade; a script sends none.
    expect(originAllowed(from())).toBe(true)
  })

  it('refuses another site', () => {
    expect(originAllowed(from('https://elsewhere.example'))).toBe(false)
    expect(originAllowed(from('null'))).toBe(false)
  })
})

describe('the origin gate on a count', () => {
  it('lets every page the game is served from through', () => {
    for (const origin of ALLOWED_ORIGINS) expect(sentFromTheSite(from(origin))).toBe(true)
  })

  it('refuses a request with no origin, which the socket gate lets through', () => {
    expect(sentFromTheSite(from())).toBe(false)
    expect(originAllowed(from())).toBe(true)
  })

  it('refuses another site, and the opaque origin a sandboxed page sends', () => {
    expect(sentFromTheSite(from('https://elsewhere.example'))).toBe(false)
    expect(sentFromTheSite(from('null'))).toBe(false)
  })
})

describe('the session token', () => {
  const withAuth = (value: string) =>
    new Request('https://rooms.example/', { headers: { Authorization: value } })

  it('is read from a bearer header', () => {
    expect(bearer(withAuth('Bearer abc123'))).toBe('abc123')
  })

  it('is null when there is none, or the scheme is wrong, or it is empty', () => {
    expect(bearer(new Request('https://rooms.example/'))).toBeNull()
    expect(bearer(withAuth('Basic abc123'))).toBeNull()
    expect(bearer(withAuth('Bearer    '))).toBeNull()
  })

  it('is never taken from the URL, which is the point of S10', () => {
    const onUrl = new Request('https://rooms.example/me?session=abc123')
    expect(bearer(onUrl)).toBeNull()
  })
})

describe('the response helpers', () => {
  it('sends JSON with its content type and keeps the headers it was given', async () => {
    const response = json({ code: 'ABC234' }, 200, { Vary: 'Origin' })
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Vary')).toBe('Origin')
    expect(await response.json()).toEqual({ code: 'ABC234' })
  })

  it('sends plain text with the status it was given', async () => {
    const response = text('Not found', 404)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe('Not found')
  })
})

describe('reading a body', () => {
  const post = (body: string) => new Request('https://rooms.example/', { method: 'POST', body })

  it('parses JSON', async () => {
    expect(await readJson(post('{"name":"A"}'))).toEqual({ name: 'A' })
  })

  it('gives null rather than throwing on anything that is not JSON', async () => {
    // A client can send whatever it likes, so this must never be the thing that fails.
    expect(await readJson(post('not json at all'))).toBeNull()
    expect(await readJson(post(''))).toBeNull()
  })
})

describe('comparing an admin secret', () => {
  it('accepts only the exact secret', () => {
    expect(sameSecret('s3cret-token', 's3cret-token')).toBe(true)
    expect(sameSecret('s3cret-tokeN', 's3cret-token')).toBe(false)
    expect(sameSecret('', '')).toBe(true)
  })

  it('refuses a prefix, a suffix and an empty attempt', () => {
    expect(sameSecret('s3cret', 's3cret-token')).toBe(false)
    expect(sameSecret('s3cret-token-and-more', 's3cret-token')).toBe(false)
    expect(sameSecret('', 's3cret-token')).toBe(false)
  })

  it('reads the whole of both rather than stopping at the first difference', () => {
    // The point is that a wrong first character costs the same as a wrong last one, so the
    // time taken never says how much of a guess was right.
    const expected = 'a'.repeat(64)
    const firstWrong = 'b' + 'a'.repeat(63)
    const lastWrong = 'a'.repeat(63) + 'b'
    expect(sameSecret(firstWrong, expected)).toBe(false)
    expect(sameSecret(lastWrong, expected)).toBe(false)
  })
})
