/**
 * The HTTP shapes both workers answer in: which origins are allowed, the CORS headers, and the
 * two response helpers. Pulled out of `server/worker.ts`, which held the routing, the CORS, the
 * auth forwarding and both Durable Objects in one untested file (backlog Q37). Nothing here
 * touches Cloudflare, so it can be tested directly.
 */

export const ALLOWED_ORIGINS = [
  'https://sgreen-dev.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
]

/**
 * A disallowed origin is answered with the primary one, which the browser then rejects: naming
 * the caller's own origin back is what would let any site read the answer.
 */
export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

/** A browser always sends its origin on an upgrade; a script sends none. Other sites are refused. */
export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return origin === null || ALLOWED_ORIGINS.includes(origin)
}

export function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

export function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers })
}

/** The session token from the Authorization header. The URL is not read (backlog S10). */
export function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

/** A request body as JSON, or null when it is not JSON at all. A client can send anything. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/**
 * Compares a secret without giving away how much of it was right (backlog Q39). A plain `===`
 * stops at the first character that differs, and how long that takes is a hint; this always
 * reads the whole of both.
 */
export function sameSecret(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false
  let same = 0
  for (let i = 0; i < given.length; i++) same |= given.charCodeAt(i) ^ expected.charCodeAt(i)
  return same === 0
}
