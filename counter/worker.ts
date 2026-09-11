/**
 * The matches-played counter: a Cloudflare Worker with one KV namespace bound as COUNTS.
 *
 *   GET  /         -> { count }
 *   POST /         -> adds one finished match and returns { count }
 *   GET  /version  -> { commit } this worker was deployed from (backlog Q36)
 *   POST /error    -> records a crash from a player's browser (backlog Q38)
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

// The room worker's list, so the two cannot disagree about where the game is (backlog Q45).
import { ALLOWED_ORIGINS } from '../src/server/http.ts'

const KEY = 'matches'
const ERRORS_KEY = 'errors'
const MIN_GAP_MS = 10_000

/**
 * Crash reports (backlog Q38). This worker is where they go because it is the one that already
 * has a KV namespace and gates nothing: losing a report costs nothing, and no part of the game
 * waits on it. Read them back with `npm run errors`.
 *
 * Only what is needed to find the bug is kept — the message, the stack, the commit and the time.
 * Never a player's name, their collection or a room code. Both text fields are cut to a length
 * that cannot fill the value, and only the most recent few are kept.
 */
const ERROR_LIMIT = 25
const MESSAGE_MAX = 300
const STACK_MAX = 2000

interface ErrorReport {
  message: string
  stack: string
  commit: string
  at: number
}

function textField(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

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
    if (request.method === 'POST' && new URL(request.url).pathname === '/error') {
      if (!allowed) return new Response('{"error":"origin"}', { status: 403, headers })
      const address = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      // Its own gap, so a crash report and a finished match never crowd each other out.
      const stampKey = `errstamp:${address}`
      const last = Number(await env.COUNTS.get(stampKey)) || 0
      const now = Date.now()
      if (now - last < MIN_GAP_MS) return new Response('{"ok":true}', { headers })
      await env.COUNTS.put(stampKey, String(now), { expirationTtl: 60 })
      const body: unknown = await request.json().catch(() => null)
      const fields = (body ?? {}) as Record<string, unknown>
      const report: ErrorReport = {
        message: textField(fields['message'], MESSAGE_MAX),
        stack: textField(fields['stack'], STACK_MAX),
        commit: textField(fields['commit'], 40),
        at: now,
      }
      if (report.message === '') return new Response('{"ok":true}', { headers })
      await env.COUNTS.put(
        ERRORS_KEY,
        JSON.stringify([report, ...(await readErrors(env))].slice(0, ERROR_LIMIT)),
      )
      return new Response('{"ok":true}', { headers })
    }
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

/** The reports already stored, or none when the value is missing or unreadable. */
async function readErrors(env: Env): Promise<ErrorReport[]> {
  try {
    const raw = await env.COUNTS.get(ERRORS_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ErrorReport[]) : []
  } catch {
    return []
  }
}

function reply(count: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify({ count }), { headers })
}
