import { createContext } from 'react'
import type { Pack } from '../collection/collection.ts'
import { openNextPack, saveCollection } from '../collection/persist.ts'
import { parseServerMessage, type MatchedMessage } from '../protocol/messages.ts'
import type { CollectionState } from '../protocol/records.ts'
import type { AccountData, LeaderboardRow } from '../server/directory.ts'
import type { SocketLike, SocketFactory } from './online.ts'
import { newSeed } from './seed.ts'
import { browserStorage, saveGarages, type StorageLike } from './storage.ts'

/**
 * The player account (DESIGN.md 13). A player is made from a name and lives on the service,
 * which holds its collection and garages; the browser keeps a mirror in localStorage so every
 * screen reads as before, and asks the service whenever something changes. A recovery code
 * carries the player to another browser. Guests keep using localStorage alone.
 */

export const SESSION_KEY = 'pink-slips.session.v1'

export function loadSession(store: StorageLike | null = browserStorage()): string | null {
  try {
    return store?.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

export function saveSession(token: string, store: StorageLike | null = browserStorage()): void {
  try {
    store?.setItem(SESSION_KEY, token)
  } catch {
    // A store that refuses the token means the next visit starts signed out.
  }
}

export function clearSession(store: StorageLike | null = browserStorage()): void {
  try {
    store?.removeItem(SESSION_KEY)
  } catch {
    // Nothing to do.
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

async function call<T>(
  endpoint: string,
  path: string,
  token: string | null,
  init: RequestInit,
  fetcher: Fetcher | undefined,
): Promise<{ status: number; body: T | null }> {
  if (!fetcher) return { status: 0, body: null }
  try {
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    if (init.body) headers['Content-Type'] = 'application/json'
    const response = await fetcher(`${endpoint}${path}`, { ...init, headers })
    if (response.status === 204) return { status: 204, body: null }
    const body = (await response.json().catch(() => null)) as T | null
    return { status: response.status, body: response.ok ? body : null }
  } catch {
    return { status: 0, body: null }
  }
}

export interface NewPlayer {
  token: string
  data: AccountData
  recoveryCode: string
}

/** Makes a player from a name. Null when the service refuses or cannot be reached. */
export function createPlayer(
  endpoint: string,
  name: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<NewPlayer | null> {
  return call<NewPlayer>(
    endpoint,
    '/auth/player',
    null,
    { method: 'POST', body: JSON.stringify({ name }) },
    fetcher,
  ).then((r) => r.body)
}

/** Takes a player back with its recovery code. `unknown` means no player has that code. */
export async function recoverPlayer(
  endpoint: string,
  code: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<{ token: string; data: AccountData } | 'unknown' | null> {
  const { status, body } = await call<{ token: string; data: AccountData }>(
    endpoint,
    '/auth/recover',
    null,
    { method: 'POST', body: JSON.stringify({ code }) },
    fetcher,
  )
  if (status === 404) return 'unknown'
  return body
}

/** Replaces the recovery code and returns the new one, shown once. */
export function rotateRecovery(
  endpoint: string,
  token: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<string | null> {
  return call<{ recoveryCode: string }>(
    endpoint,
    '/me/recovery',
    token,
    { method: 'POST' },
    fetcher,
  ).then((r) => r.body?.recoveryCode ?? null)
}

export function renamePlayer(
  endpoint: string,
  token: string,
  name: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<AccountData | null> {
  return call<AccountData>(
    endpoint,
    '/me/name',
    token,
    { method: 'PUT', body: JSON.stringify({ name }) },
    fetcher,
  ).then((r) => r.body)
}

/** The account behind a token. `signedOut` means the service no longer knows the token. */
export async function fetchMe(
  endpoint: string,
  token: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<{ data: AccountData | null; signedOut: boolean }> {
  const { status, body } = await call<AccountData>(endpoint, '/me', token, {}, fetcher)
  return { data: body, signedOut: status === 401 }
}

export function claimGuest(
  endpoint: string,
  token: string,
  guest: unknown,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<AccountData | null> {
  return call<AccountData>(
    endpoint,
    '/me/claim',
    token,
    { method: 'POST', body: JSON.stringify(guest) },
    fetcher,
  ).then((r) => r.body)
}

export function pushGarages(
  endpoint: string,
  token: string,
  garages: unknown,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<AccountData | null> {
  return call<AccountData>(
    endpoint,
    '/me/garages',
    token,
    { method: 'PUT', body: JSON.stringify({ garages }) },
    fetcher,
  ).then((r) => r.body)
}

export function openPackOnline(
  endpoint: string,
  token: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<{ pack: Pack; data: AccountData } | null> {
  return call<{ pack: Pack; data: AccountData }>(
    endpoint,
    '/me/packs/open',
    token,
    { method: 'POST' },
    fetcher,
  ).then((r) => r.body)
}

export function reportCpuResult(
  endpoint: string,
  token: string,
  mode: 'cpu' | 'hotseat',
  won: boolean,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<{ packs: number; data: AccountData } | null> {
  return call<{ packs: number; data: AccountData }>(
    endpoint,
    '/me/cpu-result',
    token,
    { method: 'POST', body: JSON.stringify({ mode, won }) },
    fetcher,
  ).then((r) => r.body)
}

export function fetchLeaderboard(
  endpoint: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<LeaderboardRow[]> {
  return call<LeaderboardRow[]>(endpoint, '/leaderboard', null, {}, fetcher).then(
    (r) => r.body ?? [],
  )
}

export function signOutOnline(
  endpoint: string,
  token: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<void> {
  return call(endpoint, '/auth/logout', token, { method: 'POST' }, fetcher).then(() => undefined)
}

/** Writes the account's collection and garages over the browser's own copies. */
export function mirror(data: AccountData, store: StorageLike | null = browserStorage()): void {
  saveCollection(data.collection, store)
  saveGarages(data.garages, store)
}

/** What the screens get from the context: nothing for a guest. */
export interface AccountHandle {
  endpoint: string
  token: string
  data: AccountData
  /** Replaces the account data after the service answered with a fresh copy. */
  update: (data: AccountData) => void
  signOut: () => void
}

export const AccountContext = createContext<AccountHandle | null>(null)

/** Opens the next pack: from the account when signed in, otherwise from the browser's stack. */
export async function openNext(
  account: AccountHandle | null,
): Promise<{ state: CollectionState; pack: Pack } | null> {
  if (!account) return openNextPack(newSeed())
  const opened = await openPackOnline(account.endpoint, account.token)
  if (!opened) return null
  account.update(opened.data)
  return { state: opened.data.collection, pack: opened.pack }
}

export type QueueStatus = 'connecting' | 'waiting' | 'matched' | 'closed'

export interface QueueHandlers {
  onStatus: (status: QueueStatus) => void
  onMatched: (message: MatchedMessage) => void
  onError: (reason: string) => void
}

const openSocket: SocketFactory = (url) => new WebSocket(url)

/** One wait in the matchmaking queue. Closing the socket, from either end, leaves the queue. */
export class QueueClient {
  private socket: SocketLike | null = null
  private matched = false
  private readonly url: string
  private readonly handlers: QueueHandlers
  private readonly factory: SocketFactory

  constructor(url: string, handlers: QueueHandlers, factory: SocketFactory = openSocket) {
    this.url = url
    this.handlers = handlers
    this.factory = factory
  }

  connect(): void {
    if (this.socket) return
    this.handlers.onStatus('connecting')
    const socket = this.factory(this.url)
    this.socket = socket
    socket.addEventListener('message', (event) => {
      const message = parseServerMessage(event.data)
      if (!message) return
      if (message.type === 'waiting') this.handlers.onStatus('waiting')
      if (message.type === 'error') this.handlers.onError(message.reason)
      if (message.type === 'matched') {
        this.matched = true
        this.handlers.onStatus('matched')
        this.handlers.onMatched(message)
      }
    })
    socket.addEventListener('close', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (!this.matched) this.handlers.onStatus('closed')
    })
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return
      this.socket = null
      if (!this.matched) this.handlers.onStatus('closed')
    })
  }

  close(): void {
    const socket = this.socket
    this.socket = null
    socket?.close()
  }
}

export function queueUrl(endpoint: string, token: string): string {
  return `${endpoint.replace(/^http/, 'ws')}/queue?session=${encodeURIComponent(token)}`
}
