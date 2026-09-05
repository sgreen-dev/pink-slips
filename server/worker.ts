import { DurableObject } from 'cloudflare:workers'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isRoomCode,
  parseClientMessage,
  type ServerMessage,
} from '../src/protocol/messages.ts'
import { safeDisplayName } from '../src/protocol/names.ts'
import { Directory, type Store } from '../src/server/directory.ts'
import { sanitizeTransfer, type Transfer } from '../src/collection/stakes.ts'
import { pickPair, type Waiting } from '../src/server/queue.ts'
import { Room, type RoomSnapshot, type SeatIdentity, type Ticket } from '../src/server/room.ts'

/**
 * The online service (DESIGN.md 13): a Cloudflare Worker in front of two kinds of Durable
 * Object. One MatchRoom per room holds a match and its WebSockets. One AccountDirectory holds
 * every player, its sessions, and the matchmaking queue. A player is made from a name alone
 * and carried to another browser with a recovery code; there is no sign-in provider.
 *
 * Deploy from this directory: npx wrangler deploy. No secrets are needed.
 */

interface Env {
  ROOMS: DurableObjectNamespace<MatchRoom>
  ACCOUNTS: DurableObjectNamespace<AccountDirectory>
}

interface Attachment {
  seat: 0 | 1 | null
  identity: SeatIdentity | null
}

interface QueueAttachment extends Waiting {
  name: string
  /** Set once the queue has handed this socket a match. */
  matched?: boolean
}

/** The two transfers a finished stakes room posts, each kept to real cars outside the starters. */
function readTransfers(value: unknown): { winner: Transfer; loser: Transfer } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const winner = sanitizeTransfer(record['winner'])
  const loser = sanitizeTransfer(record['loser'])
  return winner && loser ? { winner, loser } : null
}

const ALLOWED_ORIGINS = [
  'https://sgreen-dev.github.io',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
]
const ROOM_TTL_MS = 24 * 60 * 60 * 1000
const QUEUE_TICK_MS = 5000
/** Delay from a player joining the queue to the first pairing attempt. */
const QUEUE_FIRST_MS = 200
/** New players one address may make in an hour. */
const CREATIONS_PER_HOUR = 5

function corsHeaders(request: Request): Record<string, string> {
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
function originAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin')
  return origin === null || ALLOWED_ORIGINS.includes(origin)
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers })
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

function directoryOf(env: Env): DurableObjectStub<AccountDirectory> {
  return env.ACCOUNTS.get(env.ACCOUNTS.idFromName('main'))
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

/** Recent player creations by address. Lives as long as the worker instance, which is enough. */
const recentCreations = new Map<string, number[]>()

function allowCreation(ip: string, now: number): boolean {
  const hour = 60 * 60 * 1000
  const recent = (recentCreations.get(ip) ?? []).filter((at) => now - at < hour)
  if (recent.length >= CREATIONS_PER_HOUR) {
    recentCreations.set(ip, recent)
    return false
  }
  recentCreations.set(ip, [...recent, now])
  return true
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    const path = url.pathname
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    if (path === '/new') return json({ code: newCode() }, 200, headers)

    if (path === '/auth/player' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
      if (!allowCreation(ip, Date.now())) {
        return text('Too many new players from this address. Try again later.', 429, headers)
      }
      return directoryOf(env).fetch(request)
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
      return directoryOf(env).fetch(request)
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

function attachment(ws: WebSocket): Attachment {
  const value = ws.deserializeAttachment() as Attachment | null
  return value ?? { seat: null, identity: null }
}

function queueAttachment(ws: WebSocket): QueueAttachment {
  return ws.deserializeAttachment() as QueueAttachment
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // A socket that is already gone gets its close event; nothing to do here.
  }
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
    const token = bearer(request) ?? url.searchParams.get('session')

    if (path === '/auth/player' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const name = typeof body?.['name'] === 'string' ? body['name'] : ''
      const problem = Directory.nameProblem(name)
      if (problem) return text(problem, 400, headers)
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
      return json(account ? { accountId: account.id, name: safeDisplayName(account.name) } : null)
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
    if (path === '/me/recovery' && request.method === 'POST') {
      const recoveryCode = await this.directory.rotateRecovery(token)
      return recoveryCode ? json({ recoveryCode }, 200, headers) : text('', 401, headers)
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
      const tickets: [Ticket, Ticket] = [
        { ticket: randomToken(), identity: { accountId: first.accountId, name: names[0] } },
        { ticket: randomToken(), identity: { accountId: second.accountId, name: names[1] } },
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

export class MatchRoom extends DurableObject<Env> {
  private room: Room | null = null

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      const snapshot = await ctx.storage.get<RoomSnapshot>('room')
      this.room = snapshot ? new Room(snapshot.code, snapshot.seed, snapshot) : null
    })
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/setup' && request.method === 'POST') {
      const body = (await readJson(request)) as {
        code?: string
        tickets?: [Ticket, Ticket]
        stakes?: boolean
      } | null
      if (!body?.code || !body.tickets) return text('Bad setup', 400)
      if (!this.room) this.room = new Room(body.code, this.seed())
      if (!this.room.setup(body.tickets, body.stakes === true)) return text('Room in use', 409)
      await this.persist()
      return new Response(null, { status: 204 })
    }
    const code = url.pathname.split('/').pop() ?? ''
    if (!this.room) {
      this.room = new Room(code, this.seed())
      await this.persist()
    }
    const identity = JSON.parse(request.headers.get('X-Identity') ?? 'null') as SeatIdentity | null
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat: null, identity } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  private seed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(typeof data === 'string' ? data : '')
    if (!message) {
      send(ws, { type: 'error', reason: 'That message could not be read.' })
      return
    }
    const room = this.room
    if (!room) return
    const held = attachment(ws)
    const out = room.handle(held.seat, message, randomToken, held.identity)
    for (const item of out) {
      if (item.to === null && item.message.type === 'welcome') {
        ws.serializeAttachment({ ...held, seat: item.message.seat } satisfies Attachment)
      }
    }
    for (const item of out) {
      if (item.to === null) send(ws, item.message)
      else this.broadcast(item.to, item.message)
    }
    await this.report(room)
    await this.persist()
  }

  private broadcast(seat: 0 | 1, message: ServerMessage): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (attachment(socket).seat === seat) send(socket, message)
    }
  }

  /** Once the match is over, hands the result to the directory and tells both seats. */
  private async report(room: Room): Promise<void> {
    const result = room.takeResult()
    if (!result) return
    type Side = {
      packs: number
      rating: { before: number; after: number } | null
      stakes: Transfer | null
    } | null
    let outcome = { winner: null, loser: null } as { winner: Side; loser: Side }
    const loserSeat = result.winnerSeat === 0 ? 1 : 0
    if (result.winner || result.loser) {
      const response = await directoryOf(this.env).fetch('https://directory/internal/result', {
        method: 'POST',
        body: JSON.stringify({
          winnerId: result.winner?.accountId ?? null,
          loserId: result.loser?.accountId ?? null,
          ranked: result.ranked,
          earnsPacks: !result.conceded || result.racesPlayed > 0,
          transfers: result.transfers
            ? { winner: result.transfers[result.winnerSeat], loser: result.transfers[loserSeat] }
            : null,
        }),
      })
      if (response.ok) outcome = (await response.json()) as typeof outcome
    }
    this.broadcast(result.winnerSeat, {
      type: 'result',
      packsEarned: outcome.winner?.packs ?? null,
      rating: outcome.winner?.rating ?? null,
      stakes: outcome.winner?.stakes ?? null,
    })
    this.broadcast(loserSeat, {
      type: 'result',
      packsEarned: outcome.loser?.packs ?? null,
      rating: outcome.loser?.rating ?? null,
      stakes: outcome.loser?.stakes ?? null,
    })
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    await this.dropped(ws)
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.dropped(ws)
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
    this.room = null
  }

  private async dropped(ws: WebSocket): Promise<void> {
    const seat = attachment(ws).seat
    if (seat === null || !this.room) return
    const stillHeld = this.ctx
      .getWebSockets()
      .some((socket) => socket !== ws && attachment(socket).seat === seat)
    if (stillHeld) return
    const out = this.room.disconnect(seat)
    for (const item of out) {
      for (const socket of this.ctx.getWebSockets()) {
        if (socket !== ws && attachment(socket).seat === item.to) send(socket, item.message)
      }
    }
    await this.persist()
  }

  private async persist(): Promise<void> {
    if (!this.room) return
    await this.ctx.storage.put('room', this.room.snapshot())
    await this.ctx.storage.setAlarm(Date.now() + ROOM_TTL_MS)
  }
}
