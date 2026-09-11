import {
  bearer,
  corsHeaders,
  json,
  originAllowed,
  readJson,
  sameSecret,
  sentFromTheSite,
  text,
} from '../src/server/http.ts'
import { isRoomCode } from '../src/protocol/messages.ts'
import { KEEP_DAYS } from '../src/server/analytics.ts'
import type { SeatIdentity } from '../src/server/room.ts'
import { analyticsOf } from './analytics.ts'
import { directoryOf, type Env } from './env.ts'
import { newCode } from '../src/server/ids.ts'

/**
 * The room service's entry point: nothing but routing and the CORS around it. The two Durable
 * Objects live in their own files and are re-exported here because `wrangler.toml` names this
 * module as `main` and looks for the classes on it (backlog Q37).
 *
 * Routes:
 *   GET  /version            what this deployment was built from (backlog Q36)
 *   GET  /new                a fresh room code
 *   POST /events             what the game counts, from a browser (backlog Q40)
 *   GET  /admin/stats        the report; needs the ADMIN_TOKEN secret
 *   POST /auth/*             player creation, recovery and sign out
 *   GET  /me, /leaderboard   the account routes, all served by the directory
 *   DELETE /admin/player     removes a player; needs the ADMIN_TOKEN secret (backlog Q39)
 *   GET  /queue              the ranked queue, as a WebSocket
 *   GET  /room/CODE          a room, as a WebSocket
 */

export { AccountDirectory } from './accounts.ts'
export { Analytics } from './analytics.ts'
export { MatchRoom } from './rooms.ts'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    const path = url.pathname
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    // What this deployment was built from, so the deploy check can say whether the site and
    // the workers are the same commit rather than only that each one answered (backlog Q36).
    if (path === '/version') return json({ commit: env.COMMIT ?? 'unknown' }, 200, headers)

    // What the game counts (backlog Q40). Only the game's own pages send these, and every one of
    // them sends its origin, so a request with none is refused here instead of being let through
    // the way a socket is (backlog S17). Otherwise answered the same whatever was sent: nothing
    // here is worth telling a caller about.
    if (path === '/events' && request.method === 'POST') {
      if (!sentFromTheSite(request)) return text('Origin not allowed', 403, headers)
      await analyticsOf(env).record(await readJson(request), Date.now())
      return new Response(null, { status: 204, headers })
    }

    // The report, for the owner alone. Same guard as the admin delete: with no secret set the
    // route answers 404 rather than existing unprotected.
    if (path === '/admin/stats' && request.method === 'GET') {
      const secret = env.ADMIN_TOKEN
      if (!secret) return text('Not found', 404, headers)
      if (!sameSecret(bearer(request) ?? '', secret)) return text('Not allowed', 403, headers)
      const days = Number(url.searchParams.get('days') ?? '30')
      // No wider than the days the object keeps, so a report never reads a day a prune dropped.
      const window = Number.isFinite(days) ? Math.min(Math.max(Math.trunc(days), 1), KEEP_DAYS) : 30
      return json(await analyticsOf(env).report(Date.now(), window), 200, headers)
    }

    if (path === '/new') return json({ code: newCode() }, 200, headers)

    if (path === '/auth/player' && request.method === 'POST') {
      // The address is read here, where Cloudflare sets it, and carried to the directory on a
      // header this worker replaces rather than forwards, so a client cannot name its own.
      const forwarded = new Request(request)
      forwarded.headers.set('X-Address', request.headers.get('CF-Connecting-IP') ?? 'unknown')
      return directoryOf(env).fetch(forwarded)
    }
    if ((path === '/auth/recover' || path === '/auth/logout') && request.method === 'POST') {
      return directoryOf(env).fetch(request)
    }

    // The admin routes are served by the directory too, since the accounts are there. The
    // directory checks the secret; the router only decides who answers (backlog Q39).
    if (
      path === '/me' ||
      path.startsWith('/me/') ||
      path === '/leaderboard' ||
      path.startsWith('/admin/')
    ) {
      return directoryOf(env).fetch(request)
    }

    if (path === '/queue') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return text('Expected a WebSocket', 426, headers)
      }
      if (!originAllowed(request)) return text('Origin not allowed', 403, headers)
      // Carried the same way the creation limit carries it: set here, never forwarded, so a
      // client cannot claim to be somewhere else and pair with itself.
      const forwarded = new Request(request)
      forwarded.headers.set('X-Address', request.headers.get('CF-Connecting-IP') ?? 'unknown')
      return directoryOf(env).fetch(forwarded)
    }

    const match = /^\/room\/([A-Z0-9]+)$/.exec(path)
    const code = match?.[1] ?? ''
    if (!match || !isRoomCode(code)) return text('Not found', 404, headers)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return text('Expected a WebSocket', 426, headers)
    }
    if (!originAllowed(request)) return text('Origin not allowed', 403, headers)
    // A signed-in player carries an identity into the room, for packs at the end.
    const session = url.searchParams.get('session')
    let identity: SeatIdentity | null = null
    if (session) {
      const who = await directoryOf(env).fetch('https://directory/internal/whoami', {
        headers: { Authorization: `Bearer ${session}` },
      })
      identity = who.ok ? ((await who.json()) as SeatIdentity | null) : null
    }
    const forwarded = new Request(request)
    forwarded.headers.set('X-Identity', JSON.stringify(identity))
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    return stub.fetch(forwarded)
  },
}
