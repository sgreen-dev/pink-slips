import { describe, expect, it } from 'vitest'
import { chooseAction } from '../cpu/index.ts'
import { STARTERS } from '../data/starters.ts'
import {
  currentPlayer,
  HIDDEN_CARD,
  isOver,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'
import { parseClientMessage, type ClientMessage, type ServerMessage } from '../protocol/messages.ts'
import { REASONS, Room, type Outbound, type Ticket } from './room.ts'

function garage(index: number) {
  const starter = STARTERS[index]
  if (!starter) throw new Error('No starter')
  return { garage: starter.cars, deck: starter.deck }
}

let tokens = 0
const newToken = () => `token-${++tokens}`

/** A fake client: keeps the last view and everything the room sent it. */
class FakeClient {
  seat: PlayerIndex | null = null
  token: string | null = null
  view: MatchState | null = null
  received: ServerMessage[] = []
  readonly room: Room
  constructor(room: Room) {
    this.room = room
  }

  /** Sends a raw message the way a socket would, delivering the replies to the right client. */
  send(raw: string, others: FakeClient[]): ServerMessage[] {
    const message = parseClientMessage(raw)
    if (!message) throw new Error(`Malformed: ${raw}`)
    const out = this.room.handle(this.seat, message, newToken)
    this.deliver(out, others)
    return out.filter((o) => o.to === null || o.to === this.seat).map((o) => o.message)
  }

  deliver(out: Outbound[], others: FakeClient[]) {
    for (const item of out) {
      const targets =
        item.to === null ? [this] : [this, ...others].filter((c) => c.seat === item.to)
      for (const target of targets) target.take(item.message)
    }
  }

  take(message: ServerMessage) {
    this.received.push(message)
    if (message.type === 'welcome') {
      this.seat = message.seat
      this.token = message.token
    }
    if (message.type === 'state') this.view = message.view
  }
}

function seated(): [Room, FakeClient, FakeClient] {
  const room = new Room('ABCDEF', 7)
  const a = new FakeClient(room)
  const b = new FakeClient(room)
  a.send(JSON.stringify({ type: 'join', name: 'Ann', garage: garage(0) }), [b])
  b.send(JSON.stringify({ type: 'join', name: 'Bo', garage: garage(1) }), [a])
  return [room, a, b]
}

describe('room', () => {
  it('seats two players, starts the match, and sends each a view', () => {
    const [room, a, b] = seated()
    expect(room.started).toBe(true)
    expect(a.seat).toBe(0)
    expect(b.seat).toBe(1)
    expect(a.view).not.toBeNull()
    expect(b.view).not.toBeNull()
    expect(a.received[0]).toMatchObject({ type: 'welcome', code: 'ABCDEF', seat: 0 })
    expect(a.received.some((m) => m.type === 'waiting')).toBe(true)
    // Each view hides the other hand.
    expect(a.view?.players[1].hand.every((id) => id === HIDDEN_CARD)).toBe(true)
    expect(b.view?.players[0].hand.every((id) => id === HIDDEN_CARD)).toBe(true)
    expect(a.received.at(-1)).toMatchObject({ type: 'state', names: ['Ann', 'Bo'] })
  })

  it('rejects a third player, a bad garage, and an unknown token with a reason', () => {
    const [room, a, b] = seated()
    const c = new FakeClient(room)
    expect(c.send(JSON.stringify({ type: 'join', name: 'Cy', garage: garage(2) }), [a, b])).toEqual(
      [{ type: 'error', reason: REASONS.full }],
    )
    const fresh = new Room('ZZZZZZ', 1)
    const d = new FakeClient(fresh)
    const bad = { garage: ['nope'], deck: [] }
    expect(d.send(JSON.stringify({ type: 'join', name: 'Di', garage: bad }), [])).toEqual([
      { type: 'error', reason: REASONS.badGarage },
    ])
    expect(a.send(JSON.stringify({ type: 'resume', token: 'made-up' }), [b])).toEqual([
      { type: 'error', reason: REASONS.unknownToken },
    ])
    expect(parseClientMessage('{"type":"act"}')).toBeNull()
    expect(parseClientMessage('not json')).toBeNull()
  })

  it('rejects an illegal or out-of-turn action and changes nothing', () => {
    const [room, a, b] = seated()
    const before = JSON.stringify(room.snapshot())
    const acting = currentPlayer(a.view as MatchState)
    const idle = acting === 0 ? b : a
    const busy = acting === 0 ? a : b
    // The idle player's action is refused as belonging to the other seat when it names it,
    // and as not theirs when it names their own seat out of turn.
    expect(
      idle.send(JSON.stringify({ type: 'act', action: { type: 'endMods', player: acting } }), [
        busy,
      ]),
    ).toEqual([{ type: 'error', reason: REASONS.notYourSeat }])
    expect(
      idle.send(JSON.stringify({ type: 'act', action: { type: 'endMods', player: idle.seat } }), [
        busy,
      ]),
    ).toEqual([{ type: 'error', reason: REASONS.illegal }])
    expect(
      busy.send(JSON.stringify({ type: 'act', action: { type: 'advance', player: acting } }), [
        idle,
      ]),
    ).toEqual([{ type: 'error', reason: REASONS.illegal }])
    expect(JSON.stringify(room.snapshot())).toBe(before)
  })

  it('plays a full match through the protocol to a winner', () => {
    const [room, a, b] = seated()
    const clients = [a, b] as const
    for (let step = 0; step < 4000; step++) {
      const view = a.view as MatchState
      if (isOver(view) !== null) break
      const seat = currentPlayer(view)
      if (seat === null) throw new Error('Nobody to act')
      const me = clients[seat]
      const other = clients[seat === 0 ? 1 : 0]
      // Each client decides from its own view only, never from the room.
      const action = chooseAction(me.view as MatchState, seat, 3)
      const replies = me.send(JSON.stringify({ type: 'act', action }), [other])
      expect(replies.every((m) => m.type === 'state')).toBe(true)
    }
    const winner = isOver(a.view as MatchState)
    expect(winner === 0 || winner === 1).toBe(true)
    expect(isOver(room.snapshot().state as MatchState)).toBe(winner)
    expect(
      a.send(JSON.stringify({ type: 'act', action: { type: 'endMods', player: 0 } }), [b]),
    ).toEqual([{ type: 'error', reason: REASONS.over }])
  })

  it('lets a client that dropped mid-turn resume with its token and continue', () => {
    const [room, a, b] = seated()
    const acting = currentPlayer(a.view as MatchState) as PlayerIndex
    const dropped = acting === 0 ? a : b
    const other = acting === 0 ? b : a
    const token = dropped.token as string
    expect(room.disconnect(acting).map((o) => o.message)).toEqual([
      { type: 'presence', opponentConnected: false },
    ])
    // A new socket, no seat yet, presents the token.
    const back = new FakeClient(room)
    const replies = back.send(JSON.stringify({ type: 'resume', token }), [other])
    expect(replies[0]).toMatchObject({ type: 'welcome', seat: acting, token })
    expect(replies.some((m) => m.type === 'state')).toBe(true)
    expect(back.seat).toBe(acting)
    expect(other.received.at(-1)).toEqual({ type: 'presence', opponentConnected: true })
    // The resumed seat can act.
    const action = chooseAction(back.view as MatchState, acting, 1)
    const after = back.send(JSON.stringify({ type: 'act', action }), [other])
    expect(after.every((m) => m.type === 'state')).toBe(true)
  })

  it('rebuilds from its snapshot', () => {
    const [room, a, b] = seated()
    const copy = new Room('ignored', 0, room.snapshot())
    expect(copy.code).toBe('ABCDEF')
    expect(copy.started).toBe(true)
    expect(copy.seatOf(a.token as string)).toBe(0)
    expect(copy.seatOf(b.token as string)).toBe(1)
    expect(copy.snapshot()).toEqual(room.snapshot())
  })
})

/** Plays the match out with each client acting from its own view. */
function playOut(a: FakeClient, b: FakeClient, seed: number): PlayerIndex {
  const clients = [a, b] as const
  for (let step = 0; step < 4000; step++) {
    const view = a.view as MatchState
    if (isOver(view) !== null) break
    const seat = currentPlayer(view) as PlayerIndex
    const me = clients[seat]
    const action = chooseAction(me.view as MatchState, seat, seed)
    me.send(JSON.stringify({ type: 'act', action }), [clients[seat === 0 ? 1 : 0]])
  }
  return isOver(a.view as MatchState) as PlayerIndex
}

describe('ranked rooms', () => {
  const tickets: [Ticket, Ticket] = [
    { ticket: 'tk-a', identity: { accountId: 'acct-a', name: 'Ann' } },
    { ticket: 'tk-b', identity: { accountId: 'acct-b', name: 'Bo' } },
  ]

  it('seats only the ticket holders, names them from their accounts, and reports once', () => {
    const room = new Room('RANKED', 7)
    expect(room.setup(tickets)).toBe(true)
    expect(room.setup(tickets)).toBe(false)
    expect(room.ranked).toBe(true)
    const a = new FakeClient(room)
    const b = new FakeClient(room)
    expect(a.send(JSON.stringify({ type: 'join', name: 'Cy', garage: garage(0) }), [b])).toEqual([
      { type: 'error', reason: REASONS.badTicket },
    ])
    b.send(JSON.stringify({ type: 'join', name: 'Whoever', garage: garage(1), ticket: 'tk-b' }), [
      a,
    ])
    expect(b.seat).toBe(1)
    a.send(JSON.stringify({ type: 'join', name: 'Nope', garage: garage(0), ticket: 'tk-a' }), [b])
    expect(a.seat).toBe(0)
    expect(a.received.at(-1)).toMatchObject({ type: 'state', names: ['Ann', 'Bo'] })
    // A second holder of a ticket finds the seat taken.
    const c = new FakeClient(room)
    const late = { type: 'join', name: 'C', garage: garage(2), ticket: 'tk-a' }
    expect(c.send(JSON.stringify(late), [a, b])).toEqual([{ type: 'error', reason: REASONS.full }])
    expect(room.takeResult()).toBeNull()
    const winner = playOut(a, b, 5)
    const result = room.takeResult()
    expect(result?.ranked).toBe(true)
    expect(result?.winnerSeat).toBe(winner)
    expect(result?.winner).toEqual(tickets[winner].identity)
    expect(result?.loser).toEqual(tickets[winner === 0 ? 1 : 0].identity)
    expect(room.takeResult()).toBeNull()
    // The snapshot carries the tickets and the reported flag.
    const copy = new Room('x', 0, room.snapshot())
    expect(copy.ranked).toBe(true)
    expect(copy.takeResult()).toBeNull()
  })

  it('keeps the identity a friend room learns at join, unranked', () => {
    const room = new Room('FRIEND', 3)
    const a = new FakeClient(room)
    const b = new FakeClient(room)
    const ann = { accountId: 'acct-a', name: 'Ann' }
    const join = (c: FakeClient, name: string, index: number, others: FakeClient[]) => {
      const raw = JSON.stringify({ type: 'join', name, garage: garage(index) })
      const message = parseClientMessage(raw) as ClientMessage
      c.deliver(room.handle(c.seat, message, newToken, name === 'Ann' ? ann : null), others)
    }
    join(a, 'Ann', 0, [b])
    join(b, 'Guest', 1, [a])
    expect(room.ranked).toBe(false)
    const winner = playOut(a, b, 9)
    const result = room.takeResult()
    expect(result?.ranked).toBe(false)
    expect(winner === 0 ? result?.winner : result?.loser).toEqual(ann)
    expect(winner === 0 ? result?.loser : result?.winner).toBeNull()
  })
})
