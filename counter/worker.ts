/**
 * The matches-played counter: a Cloudflare Worker with one KV namespace bound as COUNTS.
 *
 *   GET  /   -> { count }
 *   POST /   -> adds one finished match and returns { count }
 *
 * Increments carry the game's origin and are limited to one every ten seconds per address. The
 * origin is a browser's word, not a control: anything that is not a browser sets that header
 * freely, so the rate limit is the only real brake and the number is inflatable by anyone who
 * cares to. That is accepted. It counts matches raced for the start screen, it gates nothing,
 * and KV writes are not atomic either, so two matches finishing in the same instant can already
 * lose a count. Nothing should ever be decided by this figure.
 *
 * Deploy once from this directory: npx wrangler login, npx wrangler kv namespace create COUNTS,
 * put the id in wrangler.toml, npx wrangler deploy. Then set the worker URL as the repository
 * variable VITE_COUNTER_URL so the site build picks it up.
 */

const KEY = 'matches'
const ALLOWED_ORIGINS = ['https://sgreen-dev.github.io', 'http://localhost:5173']
const MIN_GAP_MS = 10_000

export interface Env {
  COUNTS: KVNamespace
  /** The commit this worker was deployed from, set by `scripts/deploy-worker.ts` (backlog Q36). */
  COMMIT?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = ALLOWED_ORIGINS.includes(origin)
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // A disallowed origin is answered with the primary one, which the browser then rejects.
      'Access-Control-Allow-Origin': allowed ? origin : (ALLOWED_ORIGINS[0] ?? ''),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    // What this deployment was built from, for the deploy check (backlog Q36).
    if (request.method === 'GET' && new URL(request.url).pathname === '/version') {
      return new Response(JSON.stringify({ commit: env.COMMIT ?? 'unknown' }), { headers })
    }
    if (request.method === 'GET') return reply(await readCount(env), headers)
    if (request.method === 'POST') {
      if (!allowed) return new Response('{"error":"origin"}', { status: 403, headers })
      const address = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      const stampKey = `stamp:${address}`
      const last = Number(await env.COUNTS.get(stampKey)) || 0
      const now = Date.now()
      if (now - last < MIN_GAP_MS) return reply(await readCount(env), headers)
      await env.COUNTS.put(stampKey, String(now), { expirationTtl: 60 })
      const next = (await readCount(env)) + 1
      await env.COUNTS.put(KEY, String(next))
      return reply(next, headers)
    }
    return new Response('{"error":"method"}', { status: 405, headers })
  },
}

async function readCount(env: Env): Promise<number> {
  return Number(await env.COUNTS.get(KEY)) || 0
}

function reply(count: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ count }), { headers })
}
