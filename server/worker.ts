import { DurableObject } from 'cloudflare:workers'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isRoomCode,
  parseClientMessage,
  type ServerMessage,
} from '../src/protocol/messages.ts'
import { Directory, type Store } from '../src/server/directory.ts'
import { pickPair, type Waiting } from '../src/server/queue.ts'
import { Room, type RoomSnapshot, type SeatIdentity, type Ticket } from '../src/server/room.ts'

/**
 * The online service (DESIGN.md 13): a Cloudflare Worker in front of two kinds of Durable
 * Object. One MatchRoom per room holds a match and its WebSockets. One AccountDirectory holds
 * every account, its sessions, and the matchmaking queue. Sign-in goes through GitHub OAuth,
 * with a local-only shortcut for development.
 *
 * Deploy from this directory: npx wrangler deploy. Secrets: GITHUB_CLIENT_ID and
 * GITHUB_CLIENT_SECRET from the OAuth app whose callback is <worker>/auth/callback.
 */

interface Env {
  ROOMS: DurableObjectNamespace<MatchRoom>
  ACCOUNTS: DurableObjectNamespace<AccountDirectory>
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
  /** "true" only in local development: /auth/dev signs anyone in by name. */
  DEV_LOGIN?: string
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
const STATE_COOKIE = 'oauth_state'

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

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

function bearer(request: Request): string | null {
  const header = request.headers.get('Authorization') ?? ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null
}

/** A return address on the site, and nothing else. */
function allowedReturn(raw: string | null): string | null {
  if (!raw) return null
  return ALLOWED_ORIGINS.some((origin) => raw.startsWith(`${origin}/`)) ? raw : null
}

function cookieValue(request: Request, name: string): string | null {
  const cookies = request.headers.get('Cookie') ?? ''
  for (const part of cookies.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return null
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    const path = url.pathname
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })

    if (path === '/new') return json({ code: newCode() }, 200, headers)

    if (path.startsWith('/auth/')) return auth(request, env, url, headers)

    if (path === '/me' || path.startsWith('/me/') || path === '/leaderboard') {
      return directoryOf(env).fetch(request)
    }

    if (path === '/queue') {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return text('Expected a WebSocket', 426, headers)
      }
      if (!ALLOWED_ORIGINS.includes(request.headers.get('Origin') ?? '')) {
        return text('Origin not allowed', 403, headers)
      }
      return directoryOf(env).fetch(request)
    }

    const match = /^\/room\/([A-Z0-9]+)$/.exec(path)
    const code = match?.[1] ?? ''
    if (!match || !isRoomCode(code)) return text('Not found', 404, headers)
    if (request.headers.get('Upgrade') !== 'websocket') {
      return text('Expected a WebSocket', 426, headers)
    }
    if (!ALLOWED_ORIGINS.includes(request.headers.get('Origin') ?? '')) {
      return text('Origin not allowed', 403, headers)
    }
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

/** Sign-in: GitHub OAuth, or the local shortcut. Ends by sending the browser back to the site. */
async function auth(
  request: Request,
  env: Env,
  url: URL,
  headers: Record<string, string>,
): Promise<Response> {
  const path = url.pathname
  const configured = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
  if (path === '/auth/status') return json({ signIn: configured }, 200, headers)
  if (path === '/auth/login') {
    const returnTo = allowedReturn(url.searchParams.get('return'))
    if (!returnTo) return text('Bad return address', 400, headers)
    const clientId = env.GITHUB_CLIENT_ID
    if (!clientId || !configured) {
      return text('Sign-in is not set up on this service.', 503, headers)
    }
    const nonce = randomToken()
    const state = `${nonce}.${btoa(returnTo)}`
    const target = new URL('https://github.com/login/oauth/authorize')
    target.searchParams.set('client_id', clientId)
    target.searchParams.set('redirect_uri', `${url.origin}/auth/callback`)
    target.searchParams.set('state', state)
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.toString(),
        'Set-Cookie': `${STATE_COOKIE}=${nonce}; Path=/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    })
  }
  if (path === '/auth/callback') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') ?? ''
    const [nonce, encoded] = state.split('.')
    const returnTo = allowedReturn(encoded ? safeAtob(encoded) : null)
    if (!code || !nonce || !returnTo || cookieValue(request, STATE_COOKIE) !== nonce) {
      return text('Sign-in did not complete. Go back to the game and try again.', 400, headers)
    }
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
      return text('Sign-in is not set up on this service.', 503, headers)
    }
    const result = await githubUser(
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
      code,
      url.origin,
    )
    if ('error' in result) {
      return text(`GitHub did not confirm the sign-in (${result.error}). Try again.`, 502, headers)
    }
    const { user } = result
    return finishSignIn(env, 'github', String(user.id), user.login, returnTo)
  }
  if (path === '/auth/dev' && env.DEV_LOGIN === 'true') {
    const returnTo = allowedReturn(url.searchParams.get('return'))
    const name = url.searchParams.get('name') ?? ''
    if (!returnTo || !name) return text('Needs name and return', 400, headers)
    return finishSignIn(env, 'dev', name.toLowerCase(), name, returnTo)
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    const token = bearer(request)
    if (token) await directoryOf(env).fetch(request)
    return new Response(null, { status: 204, headers })
  }
  return text('Not found', 404, headers)
}

function safeAtob(value: string): string | null {
  try {
    return atob(value)
  } catch {
    return null
  }
}

type GithubResult = { user: { id: number; login: string } } | { error: string }

/** Exchanges the code for a token and asks GitHub who it is. The error names what failed. */
async function githubUser(
  clientId: string,
  clientSecret: string,
  code: string,
  origin: string,
): Promise<GithubResult> {
  try {
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'pink-slips',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${origin}/auth/callback`,
      }),
    })
    const granted = (await exchange.json().catch(() => ({}))) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    if (!granted.access_token) {
      const reason = granted.error ?? `token exchange returned ${exchange.status}`
      console.error(
        'github token exchange failed',
        exchange.status,
        reason,
        granted.error_description,
      )
      return { error: reason }
    }
    const profile = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${granted.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'pink-slips',
      },
    })
    if (!profile.ok) {
      console.error('github user lookup failed', profile.status)
      return { error: `user lookup returned ${profile.status}` }
    }
    const user = (await profile.json()) as { id?: number; login?: string }
    return typeof user.id === 'number' && typeof user.login === 'string'
      ? { user: { id: user.id, login: user.login } }
      : { error: 'user lookup returned no login' }
  } catch (error) {
    console.error('github sign-in threw', String(error))
    return { error: 'GitHub could not be reached' }
  }
}

async function finishSignIn(
  env: Env,
  provider: string,
  providerId: string,
  name: string,
  returnTo: string,
): Promise<Response> {
  const response = await directoryOf(env).fetch('https://directory/internal/sign-in', {
    method: 'POST',
    body: JSON.stringify({ provider, providerId, name }),
  })
  if (!response.ok) return text('The account service did not answer.', 502)
  const { token } = (await response.json()) as { token: string }
  return new Response(null, { status: 302, headers: { Location: `${returnTo}#session=${token}` } })
}

function queueAttachment(ws: WebSocket): QueueAttachment {
  return ws.deserializeAttachment() as QueueAttachment
}

function attachment(ws: WebSocket): Attachment {
  const value = ws.deserializeAttachment() as Attachment | null
  return value ?? { seat: null, identity: null }
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
    this.directory = new Directory(new ObjectStore(ctx.storage), randomToken)
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    const path = url.pathname
    const token = bearer(request) ?? url.searchParams.get('session')

    if (path === '/internal/sign-in' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const provider = body?.['provider']
      const providerId = body?.['providerId']
      const name = body?.['name']
      if (
        typeof provider !== 'string' ||
        typeof providerId !== 'string' ||
        typeof name !== 'string'
      ) {
        return text('Bad sign-in', 400)
      }
      const signedIn = await this.directory.signIn(provider, providerId, name)
      return json({ token: signedIn.token })
    }
    if (path === '/internal/whoami') {
      const account = token ? await this.directory.accountFor(token) : null
      return json(account ? { accountId: account.id, name: account.name } : null)
    }
    if (path === '/internal/result' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const winnerId = body?.['winnerId']
      const loserId = body?.['loserId']
      const outcome = await this.directory.recordResult(
        typeof winnerId === 'string' ? winnerId : null,
        typeof loserId === 'string' ? loserId : null,
        body?.['ranked'] === true,
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
    if (path === '/me/packs/open' && request.method === 'POST') {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
      const opened = await this.directory.openPack(token, seed)
      if (opened) return json(opened, 200, headers)
      const account = await this.directory.accountFor(token)
      return account ? text('No packs to open', 409, headers) : text('', 401, headers)
    }
    if (path === '/me/cpu-result' && request.method === 'POST') {
      const body = (await readJson(request)) as Record<string, unknown> | null
      const result = await this.directory.cpuResult(token, body?.['mode'], body?.['won'])
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
        body: JSON.stringify({ code, tickets }),
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
      const body = (await readJson(request)) as { code?: string; tickets?: [Ticket, Ticket] } | null
      if (!body?.code || !body.tickets) return text('Bad setup', 400)
      if (!this.room) this.room = new Room(body.code, this.seed())
      if (!this.room.setup(body.tickets)) return text('Room in use', 409)
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
    let outcome = { winner: null, loser: null } as {
      winner: { packs: number; rating: { before: number; after: number } | null } | null
      loser: { packs: number; rating: { before: number; after: number } | null } | null
    }
    if (result.winner || result.loser) {
      const response = await directoryOf(this.env).fetch('https://directory/internal/result', {
        method: 'POST',
        body: JSON.stringify({
          winnerId: result.winner?.accountId ?? null,
          loserId: result.loser?.accountId ?? null,
          ranked: result.ranked,
        }),
      })
      if (response.ok) outcome = (await response.json()) as typeof outcome
    }
    const loserSeat = result.winnerSeat === 0 ? 1 : 0
    this.broadcast(result.winnerSeat, {
      type: 'result',
      packsEarned: outcome.winner?.packs ?? null,
      rating: outcome.winner?.rating ?? null,
    })
    this.broadcast(loserSeat, {
      type: 'result',
      packsEarned: outcome.loser?.packs ?? null,
      rating: outcome.loser?.rating ?? null,
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
