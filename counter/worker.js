/**
 * The matches-played counter: a Cloudflare Worker with one KV namespace bound as COUNTS.
 *
 *   GET  /   -> { count }
 *   POST /   -> adds one finished match and returns { count }
 *
 * Increments are accepted only from the game's origins and at most one every ten seconds per
 * address. KV writes are not atomic, so two matches finishing in the same instant can lose a
 * count; for a number nobody is meant to notice, that is fine.
 *
 * Deploy once from this directory: npx wrangler login, npx wrangler kv namespace create COUNTS,
 * put the id in wrangler.toml, npx wrangler deploy. Then set the worker URL as the repository
 * variable VITE_COUNTER_URL so the site build picks it up.
 */

const KEY = 'matches'
const ALLOWED_ORIGINS = ['https://sgreen-dev.github.io', 'http://localhost:5173']
const MIN_GAP_MS = 10_000

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') ?? ''
    const allowed = ALLOWED_ORIGINS.includes(origin)
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
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

async function readCount(env) {
  return Number(await env.COUNTS.get(KEY)) || 0
}

function reply(count, headers) {
  return new Response(JSON.stringify({ count }), { headers })
}
