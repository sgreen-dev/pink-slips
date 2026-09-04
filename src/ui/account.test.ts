import { describe, expect, it } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import type { AccountData } from '../server/directory.ts'
import {
  clearSession,
  fetchMe,
  loadSession,
  mirror,
  QueueClient,
  queueUrl,
  saveSession,
  sessionFromHash,
  signInAvailable,
  signInUrl,
  type QueueStatus,
} from './account.ts'
import type { SocketLike } from './online.ts'
import { GARAGES_KEY, type StorageLike } from './storage.ts'

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
  closed = false
  private listeners = new Map<string, ((event: { data?: unknown }) => void)[]>()
  send() {}
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

const sample: AccountData = {
  profile: {
    id: 'a',
    name: 'Ann',
    rating: 1000,
    wins: 0,
    losses: 0,
    cards: 46,
    packs: 1,
    claimed: true,
  },
  collection: { owned: { x: 1 }, packs: 1, variants: { foil: {}, holo: {} } },
  garages: [{ id: 'g', name: 'G', cars: ['x'], deck: [], updatedAt: 1 }],
}

describe('the session', () => {
  it('comes from the sign-in fragment or storage, and clears', () => {
    expect(sessionFromHash('#session=abc123')).toBe('abc123')
    expect(sessionFromHash('#other=1&session=abc123')).toBe('abc123')
    expect(sessionFromHash('#session=../evil')).toBeNull()
    expect(sessionFromHash('')).toBeNull()
    const store = fakeStore()
    expect(loadSession(store)).toBeNull()
    saveSession('tok', store)
    expect(loadSession(store)).toBe('tok')
    clearSession(store)
    expect(loadSession(store)).toBeNull()
    expect(signInUrl('https://s.dev', 'https://x.dev/pink-slips/')).toBe(
      'https://s.dev/auth/login?return=https%3A%2F%2Fx.dev%2Fpink-slips%2F',
    )
    expect(queueUrl('https://s.dev', 'tok')).toBe('wss://s.dev/queue?session=tok')
  })

  it('tells a lost session apart from a service that is down', async () => {
    const ok = async () => new Response(JSON.stringify(sample), { status: 200 })
    expect(await fetchMe('https://s.dev', 'tok', ok)).toEqual({ data: sample, signedOut: false })
    const gone = async () => new Response('', { status: 401 })
    expect(await fetchMe('https://s.dev', 'tok', gone)).toEqual({ data: null, signedOut: true })
    const down = async () => {
      throw new Error('offline')
    }
    expect(await fetchMe('https://s.dev', 'tok', down)).toEqual({ data: null, signedOut: false })
  })

  it('shows sign-in only when the service says it is configured', async () => {
    const yes = async () => new Response(JSON.stringify({ signIn: true }))
    const no = async () => new Response(JSON.stringify({ signIn: false }))
    const down = async () => {
      throw new Error('offline')
    }
    expect(await signInAvailable('https://s.dev', yes)).toBe(true)
    expect(await signInAvailable('https://s.dev', no)).toBe(false)
    expect(await signInAvailable('https://s.dev', down)).toBe(false)
  })

  it('mirrors the account over the local collection and garages', () => {
    const store = fakeStore()
    mirror(sample, store)
    expect(JSON.parse(store.data.get(COLLECTION_KEY) ?? '')).toEqual(sample.collection)
    expect(JSON.parse(store.data.get(GARAGES_KEY) ?? '')).toEqual(sample.garages)
  })
})

describe('QueueClient', () => {
  it('reports waiting, hands over the match, and tells a drop apart from a match', () => {
    const sockets: FakeSocket[] = []
    const statuses: QueueStatus[] = []
    const matched: string[] = []
    const errors: string[] = []
    const client = new QueueClient(
      'wss://s.dev/queue?session=t',
      {
        onStatus: (s) => statuses.push(s),
        onMatched: (m) => matched.push(m.code),
        onError: (r) => errors.push(r),
      },
      () => {
        const socket = new FakeSocket()
        sockets.push(socket)
        return socket
      },
    )
    client.connect()
    client.connect()
    expect(sockets).toHaveLength(1)
    const socket = sockets[0] as FakeSocket
    socket.fire('message', JSON.stringify({ type: 'waiting' }))
    socket.fire('message', JSON.stringify({ type: 'error', reason: 'x' }))
    socket.fire('message', 'garbage')
    socket.fire(
      'message',
      JSON.stringify({ type: 'matched', code: 'ABC234', ticket: 't', opponent: 'Bo' }),
    )
    socket.fire('close')
    expect(statuses).toEqual(['connecting', 'waiting', 'matched'])
    expect(matched).toEqual(['ABC234'])
    expect(errors).toEqual(['x'])

    const dropped = new QueueClient(
      'wss://s.dev/queue',
      {
        onStatus: (s) => statuses.push(s),
        onMatched: () => {},
        onError: () => {},
      },
      () => {
        const s = new FakeSocket()
        sockets.push(s)
        return s
      },
    )
    dropped.connect()
    ;(sockets[1] as FakeSocket).fire('close')
    expect(statuses.at(-1)).toBe('closed')
    dropped.connect()
    dropped.close()
    expect((sockets[2] as FakeSocket).closed).toBe(true)
  })
})
