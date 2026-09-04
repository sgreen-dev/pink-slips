import { describe, expect, it } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import type { AccountData } from '../server/directory.ts'
import {
  clearSession,
  createPlayer,
  fetchMe,
  loadSession,
  mirror,
  QueueClient,
  queueUrl,
  recoverPlayer,
  renamePlayer,
  rotateRecovery,
  saveSession,
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

/** A fetcher that answers every call with one status and body, and records the requests. */
function answering(status: number, body: unknown) {
  const calls: { url: string; init?: RequestInit }[] = []
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return new Response(body === null ? '' : JSON.stringify(body), { status })
  }
  return { fetcher, calls }
}

const down = async () => {
  throw new Error('offline')
}

describe('the session', () => {
  it('lives in storage and clears', () => {
    const store = fakeStore()
    expect(loadSession(store)).toBeNull()
    saveSession('tok', store)
    expect(loadSession(store)).toBe('tok')
    clearSession(store)
    expect(loadSession(store)).toBeNull()
    expect(queueUrl('https://s.dev', 'tok')).toBe('wss://s.dev/queue?session=tok')
  })

  it('tells a lost session apart from a service that is down', async () => {
    const ok = answering(200, sample).fetcher
    expect(await fetchMe('https://s.dev', 'tok', ok)).toEqual({ data: sample, signedOut: false })
    const gone = answering(401, null).fetcher
    expect(await fetchMe('https://s.dev', 'tok', gone)).toEqual({ data: null, signedOut: true })
    expect(await fetchMe('https://s.dev', 'tok', down)).toEqual({ data: null, signedOut: false })
  })

  it('mirrors the account over the local collection and garages', () => {
    const store = fakeStore()
    mirror(sample, store)
    expect(JSON.parse(store.data.get(COLLECTION_KEY) ?? '')).toEqual(sample.collection)
    expect(JSON.parse(store.data.get(GARAGES_KEY) ?? '')).toEqual(sample.garages)
  })
})

describe('players', () => {
  it('are made from a name and come with a recovery code', async () => {
    const made = { token: 't', data: sample, recoveryCode: 'ABCD-EFGH-JKLM' }
    const { fetcher, calls } = answering(200, made)
    expect(await createPlayer('https://s.dev', 'Ann', fetcher)).toEqual(made)
    expect(calls[0]?.url).toBe('https://s.dev/auth/player')
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: 'Ann' })
    expect(await createPlayer('https://s.dev', 'Ann', answering(429, null).fetcher)).toBeNull()
    expect(await createPlayer('https://s.dev', 'Ann', down)).toBeNull()
  })

  it('recover with a code, telling an unknown code apart from an outage', async () => {
    const found = { token: 't2', data: sample }
    const ok = answering(200, found).fetcher
    expect(await recoverPlayer('https://s.dev', 'ABCD-EFGH-JKLM', ok)).toEqual(found)
    const missing = answering(404, null).fetcher
    expect(await recoverPlayer('https://s.dev', 'nope', missing)).toBe('unknown')
    expect(await recoverPlayer('https://s.dev', 'ABCD-EFGH-JKLM', down)).toBeNull()
  })

  it('rotate their code and rename', async () => {
    const rotated = answering(200, { recoveryCode: 'NEWW-CODE-HERE' })
    expect(await rotateRecovery('https://s.dev', 't', rotated.fetcher)).toBe('NEWW-CODE-HERE')
    expect(rotated.calls[0]?.init?.headers).toMatchObject({ Authorization: 'Bearer t' })
    expect(await rotateRecovery('https://s.dev', 't', answering(401, null).fetcher)).toBeNull()
    const renamed = answering(200, { ...sample, profile: { ...sample.profile, name: 'Annie' } })
    const result = await renamePlayer('https://s.dev', 't', 'Annie', renamed.fetcher)
    expect(result?.profile.name).toBe('Annie')
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
