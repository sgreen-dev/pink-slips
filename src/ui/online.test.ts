import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { packsEarned } from '../collection/collection.ts'
import { createMatch, redact } from '../engine/index.ts'
import { playOutRandomly, starterConfig } from '../engine/test-helpers.ts'
import type { ServerMessage } from '../protocol/messages.ts'
import {
  clearOnlineSeat,
  createRoom,
  loadOnlineSeat,
  normalizeCode,
  ONLINE_KEY,
  RECONNECT_FIRST_MS,
  reduceOnline,
  RoomClient,
  roomFromSearch,
  roomLink,
  saveOnlineSeat,
  socketUrl,
  startOnline,
  type SocketLike,
  type Status,
} from './online.ts'
import type { StorageLike } from './storage.ts'

function fakeStore(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

class FakeSocket implements SocketLike {
  sent: string[] = []
  closed = false
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>()
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  addEventListener(type: string, listener: (event: { data?: unknown }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  fire(type: string, data?: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener({ data })
  }
}

describe('room addresses', () => {
  it('turns the service URL into a socket URL for a room', () => {
    expect(socketUrl('https://rooms.example.dev', 'ABC234')).toBe(
      'wss://rooms.example.dev/room/ABC234',
    )
    expect(socketUrl('http://localhost:8787', 'ABC234')).toBe('ws://localhost:8787/room/ABC234')
  })

  it('reads codes as typed, pasted, or linked', () => {
    expect(normalizeCode(' abc-234 ')).toBe('ABC234')
    expect(normalizeCode('ABC0I1')).toBeNull()
    expect(normalizeCode('ABC23')).toBeNull()
    expect(roomFromSearch('?room=abc234')).toBe('ABC234')
    expect(roomFromSearch('?room=nope')).toBeNull()
    expect(roomFromSearch('')).toBeNull()
    expect(roomLink('ABC234', { origin: 'https://x.dev', pathname: '/pink-slips/' })).toBe(
      'https://x.dev/pink-slips/?room=ABC234',
    )
  })

  it('asks the service for a code and gives up quietly', async () => {
    const ok = async () => new Response(JSON.stringify({ code: 'ABC234' }))
    expect(await createRoom('https://x.dev', ok)).toBe('ABC234')
    const odd = async () => new Response(JSON.stringify({ code: 'no' }))
    expect(await createRoom('https://x.dev', odd)).toBeNull()
    const down = async () => {
      throw new Error('offline')
    }
    expect(await createRoom('https://x.dev', down)).toBeNull()
    expect(await createRoom('https://x.dev', undefined)).toBeNull()
  })
})

describe('the saved seat', () => {
  it('round-trips and survives bad data', () => {
    const store = fakeStore()
    expect(loadOnlineSeat(store)).toBeNull()
    const seat = { code: 'ABC234', token: 't', seat: 1 as const, name: 'Ann' }
    expect(saveOnlineSeat(seat, store)).toBe(true)
    expect(loadOnlineSeat(store)).toEqual(seat)
    store.setItem(ONLINE_KEY, '{"code":1}')
    expect(loadOnlineSeat(store)).toBeNull()
    saveOnlineSeat(seat, store)
    clearOnlineSeat(store)
    expect(loadOnlineSeat(store)).toBeNull()
    expect(loadOnlineSeat(null)).toBeNull()
  })
})

describe('RoomClient', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setUp() {
    const sockets: FakeSocket[] = []
    const messages: ServerMessage[] = []
    const statuses: Status[] = []
    const client = new RoomClient(
      'wss://x.dev/room/ABC234',
      { onMessage: (m) => messages.push(m), onStatus: (s) => statuses.push(s) },
      () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    )
    return { client, sockets, messages, statuses }
  }

  it('sends the join once the socket opens and resumes with the token after a drop', () => {
    const { client, sockets, messages, statuses } = setUp()
    client.join('Ann', { garage: ['a'], deck: ['b'] })
    client.connect()
    const first = sockets[0] as FakeSocket
    expect(first.sent).toEqual([])
    first.fire('open')
    expect(JSON.parse(first.sent[0] ?? '')).toMatchObject({ type: 'join', name: 'Ann' })
    expect(statuses).toEqual(['connecting', 'open'])
    first.fire('message', JSON.stringify({ type: 'welcome', code: 'ABC234', seat: 0, token: 'T' }))
    first.fire('message', 'not json')
    first.fire('message', JSON.stringify({ type: 'nope' }))
    expect(messages).toEqual([{ type: 'welcome', code: 'ABC234', seat: 0, token: 'T' }])
    client.act({ type: 'endMods', player: 0 })
    expect(JSON.parse(first.sent[1] ?? '')).toEqual({
      type: 'act',
      action: { type: 'endMods', player: 0 },
    })
    // The connection drops; after the first wait a new socket opens and resumes the seat.
    first.fire('close')
    expect(statuses.at(-1)).toBe('connecting')
    expect(sockets).toHaveLength(1)
    vi.advanceTimersByTime(RECONNECT_FIRST_MS)
    expect(sockets).toHaveLength(2)
    const second = sockets[1] as FakeSocket
    second.fire('open')
    expect(JSON.parse(second.sent[0] ?? '')).toEqual({ type: 'resume', token: 'T' })
    // Nothing is sent while the socket is down.
    second.fire('close')
    client.act({ type: 'endMods', player: 0 })
    expect(second.sent).toHaveLength(1)
  })

  it('stops reconnecting once closed', () => {
    const { client, sockets, statuses } = setUp()
    client.resume('T')
    client.connect()
    ;(sockets[0] as FakeSocket).fire('close')
    client.close()
    vi.advanceTimersByTime(RECONNECT_FIRST_MS * 4)
    expect(sockets).toHaveLength(1)
    expect(statuses.at(-1)).toBe('closed')
    client.connect()
    expect(sockets).toHaveLength(1)
  })
})

describe('the online session', () => {
  it('follows the room through joining, playing, a race end, and the held view', () => {
    let session = startOnline('ABC234', 'Ann')
    const send = (message: ServerMessage) => {
      session = reduceOnline(session, { type: 'message', message })
    }
    send({ type: 'welcome', code: 'ABC234', seat: 0, token: 'T' })
    send({ type: 'waiting' })
    expect(session).toMatchObject({ seat: 0, token: 'T', waiting: true, view: null })
    send({ type: 'error', reason: 'x' })
    expect(session.error).toBe('x')

    // Views straight from the engine, redacted the way the room does it.
    let state = createMatch(starterConfig(0, 1), 11)
    const names = ['Ann', 'Bo'] as const
    send({ type: 'state', view: redact(state, 0), names })
    expect(session).toMatchObject({ waiting: false, error: null, raceEnd: null, names })
    expect(session.view?.players[1].hand.every((id) => id === '?')).toBe(true)
    for (let i = 0; i < 400 && session.raceEnd === null; i++) {
      state = playOutRandomly(state, 100 + i, 1)
      send({ type: 'state', view: redact(state, 0), names })
    }
    expect(session.raceEnd).not.toBeNull()
    const shown = session.view
    // Views that arrive during the banner are held, then applied on continue.
    state = playOutRandomly(state, 999, 1)
    send({ type: 'state', view: redact(state, 0), names })
    expect(session.view).toBe(shown)
    expect(session.held).not.toBeNull()
    session = reduceOnline(session, { type: 'continue' })
    expect(session.held).toBeNull()
    expect(session.view).not.toBe(shown)
    expect(session.raceEnd).toBeNull()
    expect(reduceOnline(session, { type: 'continue' })).toBe(session)
    session = reduceOnline(session, { type: 'status', status: 'connecting' })
    expect(session.status).toBe('connecting')
    send({ type: 'presence', opponentConnected: false })
    expect(session.opponentConnected).toBe(false)
  })

  it('earns packs online the way a CPU match does', () => {
    expect(packsEarned('online', true)).toBe(packsEarned('cpu', true))
    expect(packsEarned('online', false)).toBe(packsEarned('hotseat', false))
  })
})
