import { corsHeaders, json, originAllowed, text } from '../src/server/http.ts'
import { isRoomCode } from '../src/protocol/messages.ts'
import type { SeatIdentity } from '../src/server/room.ts'
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
 *   POST /auth/*             player creation, recovery and sign out
 *   GET  /me, /leaderboard   the account routes, all served by the directory
 *   GET  /queue              the ranked queue, as a WebSocket
 *   GET  /room/CODE          a room, as a WebSocket
 */

export { AccountDirectory } from './accounts.ts'
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

    if (path === '/me' || path.startsWith('/me/') || path === '/leaderboard') {
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
