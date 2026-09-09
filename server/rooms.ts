import { DurableObject } from 'cloudflare:workers'
import type { Transfer } from '../src/collection/stakes.ts'
import type { RngState } from '../src/engine/index.ts'
import { parseClientMessage, type ServerMessage } from '../src/protocol/messages.ts'
import { readJson, text } from '../src/server/http.ts'
import { randomToken } from '../src/server/ids.ts'
import { Room, type RoomSnapshot, type SeatIdentity, type Ticket } from '../src/server/room.ts'
import { planRoomWrite, type WrittenRoom } from '../src/server/roomWrites.ts'
import { directoryOf, type Env } from './env.ts'
import { attachment, send, type Attachment } from './sockets.ts'

/**
 * The match room Durable Object: one per room code, holding the seats, the match and the undo
 * stack, and writing itself after a seated message. The other of the two objects that used to
 * live in `server/worker.ts` (backlog Q37).
 */

const ROOM_TTL_MS = 24 * 60 * 60 * 1000

export class MatchRoom extends DurableObject<Env> {
  private room: Room | null = null
  /** The expiry and alarm last written, so an unchanged one is not written again. */
  private written: WrittenRoom | null = null

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
    // The room is built in memory and nothing is written yet. Connecting takes no seat and
    // proves nothing, and the code space is about a billion, so storing here would let anyone
    // walk it and leave a stored object per code for a day. Storage waits for a real join;
    // until then the code rides on the socket so the room can be rebuilt after hibernation.
    if (!this.room) this.room = new Room(code, this.seed())
    const identity = JSON.parse(request.headers.get('X-Identity') ?? 'null') as SeatIdentity | null
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.ctx.acceptWebSocket(server)
    server.serializeAttachment({ seat: null, identity, code } satisfies Attachment)
    return new Response(null, { status: 101, webSocket: client })
  }

  /**
   * A room's first match is seeded with the generator's full width. One 32-bit word would leave
   * every shuffle in the room inside a search a player could run offline against their own
   * opening hand, whatever the generator behind it (DESIGN.md 13).
   */
  private seed(): RngState {
    const words = crypto.getRandomValues(new Uint32Array(4))
    return [words[0] ?? 1, words[1] ?? 2, words[2] ?? 3, words[3] ?? 4]
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const message = parseClientMessage(typeof data === 'string' ? data : '')
    if (!message) {
      send(ws, { type: 'error', reason: 'That message could not be read.' })
      return
    }
    const held = attachment(ws)
    // An unstored room is gone after hibernation, so it is rebuilt from the code the socket
    // carries. A room nobody joined has no state to lose by being built again.
    const room = this.room ?? (held.code ? (this.room = new Room(held.code, this.seed())) : null)
    if (!room) return
    const out = room.handle(held.seat, message, randomToken, held.identity, Date.now())
    // Seats are recorded before anything is sent, so a broadcast in the same batch finds a
    // socket this batch just seated.
    let seated = held.seat !== null
    for (const item of out) {
      if (item.to === null && item.message.type === 'welcome') {
        seated = true
        ws.serializeAttachment({ ...held, seat: item.message.seat } satisfies Attachment)
      }
    }
    for (const item of out) {
      if (item.to === null) send(ws, item.message)
      else this.broadcast(item.to, item.message)
    }
    // Only a seat writes. A socket that has not joined can spam the room without touching
    // storage or pushing its expiry out, which is what let one be pinned alive for ever.
    if (!seated) return
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
      else {
        // The match really happened, so its packs, ratings and cars are not dropped because one
        // subrequest failed. The room takes the result back and the next message or alarm
        // reports it again; the seats are told nothing yet rather than told nulls.
        room.retryResult()
        await this.persist()
        return
      }
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
    const now = Date.now()
    const expiresAt = (await this.ctx.storage.get<number>('expiresAt')) ?? 0
    if (!this.room || now >= expiresAt) {
      // Last chance for a result that could not be reported when it happened.
      if (this.room) await this.report(this.room)
      await this.ctx.storage.deleteAll()
      this.room = null
      return
    }
    // The turn clock ran out: forfeit the seat on turn and report it like any other result.
    // Every message a timeout makes is addressed to a seat, since there is no sender here.
    const out = this.room.timeout(now)
    for (const item of out) {
      if (item.to !== null) this.broadcast(item.to, item.message)
    }
    await this.report(this.room)
    await this.persist()
  }

  private async dropped(ws: WebSocket): Promise<void> {
    const seat = attachment(ws).seat
    if (seat === null || !this.room) return
    const stillHeld = this.ctx
      .getWebSockets()
      .some((socket) => socket !== ws && attachment(socket).seat === seat)
    if (stillHeld) return
    const out = this.room.disconnect(seat, Date.now())
    for (const item of out) {
      for (const socket of this.ctx.getWebSockets()) {
        if (socket !== ws && attachment(socket).seat === item.to) send(socket, item.message)
      }
    }
    await this.persist()
  }

  /**
   * Writes the room and arms the one alarm a Durable Object has. The room forgets itself a day
   * after its last message, and a ranked seat forfeits when its turn clock runs out, so the
   * alarm is set to whichever comes first and the handler decides which one is due.
   */
  private async persist(): Promise<void> {
    if (!this.room) return
    // The snapshot always changes; the expiry and the alarm almost never do, so they are only
    // written when they actually move (backlog P5). A steady exchange writes once per message
    // instead of three times.
    const plan = planRoomWrite(this.written, Date.now(), ROOM_TTL_MS, this.room.alarmAt())
    const entries: Record<string, unknown> = { room: this.room.snapshot() }
    if (plan.expiresAt !== null) entries['expiresAt'] = plan.expiresAt
    await this.ctx.storage.put(entries)
    if (plan.alarm !== null) await this.ctx.storage.setAlarm(plan.alarm)
    this.written = plan.next
  }
}
