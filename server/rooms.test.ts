import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseAction } from '../src/cpu/index.ts'
import { STARTERS } from '../src/data/starters.ts'
import { currentPlayer, isOver, type MatchState, type PlayerIndex } from '../src/engine/index.ts'
import { MESSAGE_BURST, MESSAGE_REFILL_MS } from '../src/server/budget.ts'
import type { SeatIdentity } from '../src/server/room.ts'
import type { Env } from './env.ts'
import { MatchRoom } from './rooms.ts'
import { fakeNamespace, FakeState, type Delivery, type FakeSocket } from './testing.ts'

/**
 * The room object itself, run against a stand-in for the platform (backlog Q41). The rules of a
 * room are tested in `src/server/room.test.ts`; this is the glue around them, which had no test:
 * what a message costs in storage, what the expiry alarm leaves behind, and what the room hands
 * the directory when a match ends.
 */

const DAY = 24 * 60 * 60 * 1000
const T0 = Date.UTC(2026, 8, 11, 12)
const ANN: SeatIdentity = { accountId: 'acct-a', name: 'Ann' }
const BO: SeatIdentity = { accountId: 'acct-b', name: 'Bo' }
const SIDE = { packs: 1, rating: null, stakes: null }

function garage(index: number) {
  const starter = STARTERS[index]
  if (!starter) throw new Error('No starter')
  return { garage: starter.cars, deck: starter.deck }
}

/** A room whose directory answers every result with `answer`, and records what it was sent. */
async function openRoom(
  answer: (request: Delivery) => Response | Promise<Response> = () =>
    Response.json({ winner: SIDE, loser: SIDE }),
) {
  const directory = fakeNamespace(answer)
  const state = new FakeState()
  const room = new MatchRoom(state.asState(), { ACCOUNTS: directory.namespace } as unknown as Env)
  await state.ready
  return { state, room, directory }
}

function say(room: MatchRoom, ws: FakeSocket, message: object): Promise<void> {
  return room.webSocketMessage(ws.asSocket(), JSON.stringify(message))
}

/** Both seats taken through the messages a browser sends, seat 0 first. */
async function seatBoth(
  state: FakeState,
  room: MatchRoom,
  identities: readonly [SeatIdentity | null, SeatIdentity | null] = [null, null],
  stakes = false,
): Promise<[FakeSocket, FakeSocket]> {
  const a = state.connect({ seat: null, identity: identities[0], code: 'ABCDEF' })
  const b = state.connect({ seat: null, identity: identities[1], code: 'ABCDEF' })
  await say(room, a, { type: 'join', name: 'Ann', garage: garage(0), stakes })
  await say(room, b, { type: 'join', name: 'Bo', garage: garage(1), stakes })
  return [a, b]
}

const viewOf = (ws: FakeSocket) => ws.last('state')?.['view'] as MatchState | undefined

/** The seat on turn and the move the CPU would make for it, from what that seat was shown. */
function nextMove(seats: readonly [FakeSocket, FakeSocket]) {
  const view = viewOf(seats[0])
  if (!view) throw new Error('No view')
  const seat = currentPlayer(view) as PlayerIndex
  return { seat, action: chooseAction(viewOf(seats[seat]) ?? view, seat, 5) }
}

/** Plays the match out through its sockets at a person's pace; returns the winning seat. */
async function playOut(room: MatchRoom, seats: readonly [FakeSocket, FakeSocket]) {
  for (let step = 0; step < 4000; step++) {
    const winner = isOver(viewOf(seats[0]) as MatchState)
    if (winner !== null) return winner
    const { seat, action } = nextMove(seats)
    vi.advanceTimersByTime(MESSAGE_REFILL_MS)
    await say(room, seats[seat], { type: 'act', action })
  }
  throw new Error('The match did not end')
}

describe('the room object', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes the match when a seated message changes it, and nothing when it does not', async () => {
    const { state, room } = await openRoom()
    const seats = await seatBoth(state, room)
    expect(state.storage.data.has('room')).toBe(true)
    const before = state.storage.writes.length
    // Nothing to take back, so the room refuses; that used to cost a full write (backlog S20).
    await say(room, seats[0], { type: 'undo' })
    expect(seats[0].last('error')).toBeDefined()
    expect(state.storage.writes.slice(before)).toEqual([])
    const { seat, action } = nextMove(seats)
    await say(room, seats[seat], { type: 'act', action })
    expect(state.storage.writes.slice(before).flat()).toContain('room')
  })

  it('drops what a socket sends past its budget, and answers again as it refills', async () => {
    const { state, room } = await openRoom()
    const [a] = await seatBoth(state, room)
    const refusals = () => a.sent.filter((message) => message.type === 'error').length
    for (let i = 0; i < MESSAGE_BURST + 10; i++) await say(room, a, { type: 'undo' })
    // The join spent one message, so the burst answers one undo fewer, and the rest go
    // unanswered without reaching the room (backlog S20).
    expect(refusals()).toBe(MESSAGE_BURST - 1)
    vi.advanceTimersByTime(MESSAGE_REFILL_MS * 3)
    for (let i = 0; i < 5; i++) await say(room, a, { type: 'undo' })
    expect(refusals()).toBe(MESSAGE_BURST + 2)
  })

  it('closes its sockets when it forgets itself, so a tab left open cannot bring it back', async () => {
    const { state, room } = await openRoom()
    const [a, b] = await seatBoth(state, room)
    vi.setSystemTime(T0 + DAY + 60_000)
    await room.alarm()
    expect(a.closed).not.toBeNull()
    expect(b.closed).not.toBeNull()
    expect(state.storage.data.size).toBe(0)
    // A message already on its way from the old seat finds a new room with no seats in it and
    // writes nothing. It used to write the forgotten room back with a fresh day (backlog S19).
    await say(room, a, { type: 'undo' })
    expect(state.storage.data.size).toBe(0)
  })

  it('reports a finished match under one name until the directory answers, with both garages', async () => {
    let calls = 0
    const { state, room, directory } = await openRoom(() => {
      calls += 1
      if (calls === 1) throw new Error('The directory could not be reached')
      return Response.json({ winner: SIDE, loser: SIDE })
    })
    const seats = await seatBoth(state, room, [ANN, BO], true)
    const winner = await playOut(room, seats)
    // The first report threw. The result was kept rather than lost, and nobody was told yet.
    expect(directory.requests).toHaveLength(1)
    expect(seats[0].last('result')).toBeUndefined()
    // The next message from either seat sends it again, under the same name (backlog S18).
    vi.advanceTimersByTime(MESSAGE_REFILL_MS)
    await say(room, seats[0], { type: 'undo' })
    expect(directory.requests).toHaveLength(2)
    const [first, second] = directory.requests.map((r) => r.body as Record<string, unknown>)
    expect(first?.['resultId']).toEqual(expect.any(String))
    expect(second?.['resultId']).toBe(first?.['resultId'])
    // A stakes result carries the garage each side raced, for the directory to check (S16).
    const loser = winner === 0 ? 1 : 0
    expect(first?.['raced']).toEqual({ winner: garage(winner).garage, loser: garage(loser).garage })
    expect(seats[0].last('result')).toBeDefined()
    expect(seats[1].last('result')).toBeDefined()
  })
})
