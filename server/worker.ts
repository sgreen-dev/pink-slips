import { DurableObject } from 'cloudflare:workers'
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  isRoomCode,
  parseClientMessage,
  type ServerMessage,
} from '../src/protocol/messages.ts'
import { Room, type RoomSnapshot } from '../src/server/room.ts'

/**
 * The room service (DESIGN.md 13): a Cloudflare Worker that hands out room codes and routes
 * each room's WebSockets to one Durable Object, which holds the match. The object keeps the
 * room's snapshot in its storage, so a dropped connection or a restart loses nothing, and it
 * clears itself a day after the last message.
 *
 * Deploy from this directory: npx wrangler deploy. Then set VITE_ROOM_URL to the worker URL.
 */

interface Env {
  ROOMS: DurableObjectNamespace<MatchRoom>
}

interface Attachment {
  seat: 0 | 1 | null
}

const ALLOWED_ORIGINS = ['https://sgreen-dev.github.io', 'http://localhost:5173']
const ROOM_TTL_MS = 24 * 60 * 60 * 1000

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]!,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const headers = corsHeaders(request)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (url.pathname === '/new') {
      return new Response(JSON.stringify({ code: newCode() }), {
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }
    const match = /^\/room\/([A-Z0-9]+)$/.exec(url.pathname)
    const code = match?.[1] ?? ''
    if (!match || !isRoomCode(code)) return new Response('Not found', { status: 404, headers })
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket', { status: 426, headers })
    }
    const origin = request.headers.get('Origin') ?? ''
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return new Response('Origin not allowed', { status: 403, headers })
    }
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
    return stub.fetch(request)
  },
}

function attachment(ws: WebSocket): Attachment {
  const value = ws.deserializeAttachment() as Attachment | null
  return value ?? { seat: null }
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // A socket that is already gone gets its close event; nothing to do here.
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
    const code = new URL(request.url).pathname.split('/').pop() ?? ''
    if (!this.room) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] ?? 1
      this.room = new Room(code, seed)
      await this.persist()
    }
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat: null } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(typeof data === 'string' ? data : '')
    if (!message) {
      send(ws, { type: 'error', reason: 'That message could not be read.' })
      return
    }
    const room = this.room
    if (!room) return
    const out = room.handle(attachment(ws).seat, message, () =>
      crypto.randomUUID().replace(/-/g, ''),
    )
    for (const item of out) {
      if (item.to === null && item.message.type === 'welcome') {
        ws.serializeAttachment({ seat: item.message.seat } satisfies Attachment)
      }
    }
    for (const item of out) {
      if (item.to === null) {
        send(ws, item.message)
      } else {
        for (const socket of this.ctx.getWebSockets()) {
          if (attachment(socket).seat === item.to) send(socket, item.message)
        }
      }
    }
    await this.persist()
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
