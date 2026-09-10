import { DurableObject } from 'cloudflare:workers'
import { sanitizeTransfer, type Transfer } from '../src/collection/stakes.ts'
import { safeDisplayName } from '../src/protocol/names.ts'
import { Directory, type Store } from '../src/server/directory.ts'
import { bearer, corsHeaders, json, readJson, sameSecret, text } from '../src/server/http.ts'
import { newCode, randomToken, sha256 } from '../src/server/ids.ts'
import { pickPair } from '../src/server/queue.ts'
import type { Ticket } from '../src/server/room.ts'
import type { Env } from './env.ts'
import { queueAttachment, send, type QueueAttachment } from './sockets.ts'

/**
 * The accounts Durable Object: players, sessions, the collection it keeps for them, the ranked
 * queue and the leaderboard. One of the two objects `server/worker.ts` used to hold alongside
 * the routing and the CORS (backlog Q37).
 */

const QUEUE_TICK_MS = 5000
/** Delay from a player joining the queue to the first pairing attempt. */
const QUEUE_FIRST_MS = 200

function readTransfers(value: unknown): { winner: Transfer; loser: Transfer } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const winner = sanitizeTransfer(record['winner'])
  const loser = sanitizeTransfer(record['loser'])
  return winner && loser ? { winner, loser } : null
}

/** The directory's storage, through the interface the platform-free class expects. */
class ObjectStore implements Store {
  private readonly storage: DurableObjectStorage
  constructor(storage: DurableObjectStorage) {
    this.storage = storage
  }
  get<T>(key: string): Promise<T | undefined> {
    return this.storage.get<T>(key)
  }
  async put(key: string, value: unknown): Promise<void> {
    await this.storage.put(key, value)
  }
  async delete(key: string): Promise<void> {
    await this.storage.delete(key)
  }
  list<T>(prefix: string): Promise<Map<string, T>> {
    return this.storage.list<T>({ prefix })
  }
}

export class AccountDirectory extends DurableObject<Env> {
  private readonly directory: Directory

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.directory = new Directory(new ObjectStore(ctx.storage), randomToken, sha256)
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    const path = url.pathname
    // A browser cannot set a header on a WebSocket, so the queue socket is the one route whose
    // token may ride on the URL. Everywhere else takes the Authorization header only: a token
    // in a query string lands in request logs, in anything between, and in browser history,
    // and this one lasts a year and renews itself (DESIGN.md 13).
    const token =
      path === '/queue' ? (bearer(request) ?? url.searchParams.get('session')) : bearer(request)

    // Admin: removing a player (backlog Q39). Guarded by a secret set with `wrangler secret`
    // and nothing else, so with no secret set the route does not exist. The comparison is
    // length-safe rather than an early-exit `===`, since this one is worth not leaking.
    if (path === '/admin/player' && request.method === 'DELETE') {
      const secret = this.env.ADMIN_TOKEN
      if (!secret) return text('Not found', 404, headers)
      if (!sameSecret(bearer(request) ?? '', secret)) return text('Not allowed', 403, headers)
      const id = url.searchParams.get('id') ?? ''
      if (!id) return text('An id is required', 400, headers)
      const gone = await this.directory.deletePlayer(id)
      return gone ? json({ deleted: id }, 200, headers) : text('No such player', 404, headers)
    }

    if (path === '/auth/player' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const name = typeof body?.['name'] === 'string' ? body['name'] : ''
      const problem = Directory.nameProblem(name)
      if (problem) return text(problem, 400, headers)
      // The count lives on this object, the one the whole service shares, and not in a worker
      // isolate where retrying would find an empty one.
      const address = request.headers.get('X-Address') ?? 'unknown'
      if (!(await this.directory.allowCreation(address))) {
        return text('Too many new players from this address. Try again later.', 429, headers)
      }
      const made = await this.directory.createPlayer(name)
      return json(made, 200, headers)
    }
    if (path === '/auth/recover' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const code = body?.['code']
      const found = typeof code === 'string' ? await this.directory.recover(code) : null
      return found ? json(found, 200, headers) : text('No player has that code.', 404, headers)
    }
    if (path === '/internal/whoami') {
      const account = token ? await this.directory.accountFor(token) : null
      return json(
        account
          ? {
              accountId: account.id,
              name: safeDisplayName(account.name),
              laps: account.collection.laps,
            }
          : null,
      )
    }
    if (path === '/internal/result' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const winnerId = body?.['winnerId']
      const loserId = body?.['loserId']
      const outcome = await this.directory.recordResult(
        typeof winnerId === 'string' ? winnerId : null,
        typeof loserId === 'string' ? loserId : null,
        body?.['ranked'] === true,
        body?.['earnsPacks'] !== false,
        readTransfers(body?.['transfers']),
      )
      return json(outcome)
    }
    if (path === '/leaderboard') return json(await this.directory.leaderboard(), 200, headers)

    if (path === '/queue') return this.joinQueue(request, token)

    if (!token) return text('Sign in first', 401, headers)
    if (path === '/me' && request.method === 'GET') {
      const account = await this.directory.accountFor(token)
      return account ? json(this.directory.dataOf(account), 200, headers) : text('', 401, headers)
    }
    if (path === '/auth/logout' && request.method === 'POST') {
      await this.directory.signOut(token)
      return new Response(null, { status: 204, headers })
    }
    if (path === '/me/claim' && request.method === 'POST') {
      const data = await this.directory.claim(token, await readJson(request))
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/garages' && request.method === 'PUT') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const data = await this.directory.saveGarages(token, body?.['garages'])
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/name' && request.method === 'PUT') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const name = typeof body?.['name'] === 'string' ? body['name'] : ''
      const problem = Directory.nameProblem(name)
      if (problem) return text(problem, 400, headers)
      const data = await this.directory.rename(token, name)
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/lap' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const data = await this.directory.claimLap(token, body?.['car'])
      if (data === 'refused') {
        return text('Every car must be owned, and the keepsake must be one of them.', 400, headers)
      }
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/scrap' && request.method === 'POST') {
      const data = await this.directory.scrap(token)
      if (data === 'refused') return text('There is nothing spare to scrap.', 400, headers)
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/buy' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const data = await this.directory.buy(token, body?.['card'])
      if (data === 'refused') {
        return text(
          'That card cannot be bought: check the credits and what is already owned.',
          400,
          headers,
        )
      }
      return data ? json(data, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/recovery' && request.method === 'POST') {
      // Rotating ends every session opened before it, so the answer carries a fresh token for
      // the browser doing the rotating; without it the owner signs themselves out.
      const rotated = await this.directory.rotateRecovery(token)
      return rotated ? json(rotated, 200, headers) : text('', 401, headers)
    }
    if (path === '/me/packs/open' && request.method === 'POST') {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
      const opened = await this.directory.openPack(token, seed)
      if (opened) return json(opened, 200, headers)
      const account = await this.directory.accountFor(token)
      return account ? text('No packs to open', 409, headers) : text('', 401, headers)
    }
    if (path === '/me/cpu-result' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const result = await this.directory.cpuResult(
        token,
        body?.['mode'],
        body?.['won'],
        body?.['stakes'],
      )
      return result ? json(result, 200, headers) : text('', 401, headers)
    }
    return text('Not found', 404, headers)
  }

  /** A signed-in player waits on a socket until the queue pairs them. */
  private async joinQueue(request: Request, token: string | null): Promise<Response> {
    const account = token ? await this.directory.accountFor(token) : null
    if (!account) return text('Sign in first', 401)
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    const waiting: QueueAttachment = {
      accountId: account.id,
      name: account.name,
      rating: account.rating,
      since: Date.now(),
      stakes: new URL(request.url).searchParams.get('stakes') === '1',
      address: request.headers.get('X-Address') ?? 'unknown',
    }
    server.serializeAttachment(waiting)
    send(server, { type: 'waiting' })
    // Pair after this handshake has completed, so a match never closes a socket mid-open.
    await this.ctx.storage.setAlarm(Date.now() + QUEUE_FIRST_MS)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(): Promise<void> {
    // The queue takes nothing from the client; leaving is closing the socket.
  }

  override async alarm(): Promise<void> {
    await this.tryPair()
  }

  /**
   * Pairs whoever can be paired. Paired sockets are marked and closed, and never counted
   * again even if they linger in the list until the close completes. Anyone left waiting
   * gets another look at the next tick.
   */
  private async tryPair(): Promise<void> {
    const ratedCount = await this.directory.ratedCount()
    let sockets = this.ctx.getWebSockets().filter((ws) => !queueAttachment(ws).matched)
    for (;;) {
      const entries = sockets.map(queueAttachment)
      const pair = pickPair(entries, Date.now(), ratedCount)
      if (!pair) break
      const [first, second] = pair
      const nameOf = (id: string) => entries.find((e) => e.accountId === id)?.name ?? 'Player'
      const names: [string, string] = [nameOf(first.accountId), nameOf(second.accountId)]
      const code = newCode()
      const lapsOf = async (id: string) => (await this.directory.load(id))?.collection.laps ?? 0
      const tickets: [Ticket, Ticket] = [
        {
          ticket: randomToken(),
          identity: {
            accountId: first.accountId,
            name: names[0],
            laps: await lapsOf(first.accountId),
          },
        },
        {
          ticket: randomToken(),
          identity: {
            accountId: second.accountId,
            name: names[1],
            laps: await lapsOf(second.accountId),
          },
        },
      ]
      const room = this.env.ROOMS.get(this.env.ROOMS.idFromName(code))
      const setUp = await room.fetch('https://room/setup', {
        method: 'POST',
        body: JSON.stringify({ code, tickets, stakes: first.stakes ?? false }),
      })
      if (!setUp.ok) break
      const paired = new Set([first.accountId, second.accountId])
      for (const ws of sockets) {
        const held = queueAttachment(ws)
        if (!paired.has(held.accountId)) continue
        const index = held.accountId === first.accountId ? 0 : 1
        ws.serializeAttachment({ ...held, matched: true } satisfies QueueAttachment)
        send(ws, {
          type: 'matched',
          code,
          ticket: tickets[index].ticket,
          opponent: names[index === 0 ? 1 : 0],
        })
        try {
          ws.close(1000, 'matched')
        } catch {
          // Already gone.
        }
      }
      sockets = sockets.filter((ws) => !paired.has(queueAttachment(ws).accountId))
    }
    if (sockets.length > 0) await this.ctx.storage.setAlarm(Date.now() + QUEUE_TICK_MS)
  }
}
