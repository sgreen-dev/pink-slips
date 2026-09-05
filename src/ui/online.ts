import type { Action, MatchState, PlayerConfig, PlayerIndex } from '../engine/index.ts'
import {
  isRoomCode,
  parseServerMessage,
  type ClientMessage,
  type ResultMessage,
  type ServerMessage,
} from '../protocol/messages.ts'
import { raceEndBetween, type RaceEnd } from './celebration.ts'
import { browserStorage, readRecord, writeRecord, type StorageLike } from './storage.ts'

/**
 * The client side of online play (DESIGN.md 13): where the room service is, the socket that
 * talks to one room and comes back after a drop, the seat kept in storage for a refresh, and
 * the session reducer the online match screen runs on.
 */

/** The room service, from VITE_ROOM_URL at build time; null hides online play. */
export function roomEndpoint(): string | null {
  const raw: unknown = import.meta.env.VITE_ROOM_URL
  const trimmed = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
  return trimmed === '' ? null : trimmed
}

export function socketUrl(endpoint: string, code: string, session: string | null = null): string {
  const base = endpoint.replace(/^http/, 'ws')
  const query = session ? `?session=${encodeURIComponent(session)}` : ''
  return `${base}/room/${code}${query}`
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

/** Asks the service for a fresh room code. Null when the service cannot be reached. */
export async function createRoom(
  endpoint: string,
  fetcher: Fetcher | undefined = globalThis.fetch,
): Promise<string | null> {
  if (!fetcher) return null
  try {
    const response = await fetcher(`${endpoint}/new`, { method: 'GET' })
    if (!response.ok) return null
    const data: unknown = await response.json()
    const code = (data as { code?: unknown }).code
    return typeof code === 'string' && isRoomCode(code) ? code : null
  } catch {
    return null
  }
}

/** Reads a room code typed or pasted by a player: any case, spaces and dashes ignored. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  return isRoomCode(code) ? code : null
}

/** The room code in a shared link's query string, when there is a valid one. */
export function roomFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('room')
  return raw === null ? null : normalizeCode(raw)
}

export function roomLink(code: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?room=${code}`
}

/** The seat a player holds in a room, kept so a refresh or a dropped connection can resume. */
export interface OnlineSeat {
  code: string
  token: string
  seat: PlayerIndex
  name: string
}

export const ONLINE_KEY = 'pink-slips.online.v1'

function isOnlineSeat(value: unknown): value is OnlineSeat {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['code'] === 'string' &&
    typeof record['token'] === 'string' &&
    (record['seat'] === 0 || record['seat'] === 1) &&
    typeof record['name'] === 'string'
  )
}

export function loadOnlineSeat(store: StorageLike | null = browserStorage()): OnlineSeat | null {
  return readRecord(ONLINE_KEY, isOnlineSeat, store)
}

export function saveOnlineSeat(
  seat: OnlineSeat,
  store: StorageLike | null = browserStorage(),
): boolean {
  return writeRecord(ONLINE_KEY, seat, store)
}

export function clearOnlineSeat(store: StorageLike | null = browserStorage()): void {
  try {
    store?.removeItem(ONLINE_KEY)
  } catch {
    // Nothing to do: a store that cannot be cleared holds nothing worth keeping.
  }
}

export type Status = 'connecting' | 'open' | 'closed'

/** The part of a WebSocket the client uses, so tests can pass a fake. */
export interface SocketLike {
  send(data: string): void
  close(): void
  addEventListener(
    type: 'open' | 'message' | 'close' | 'error',
    listener: (event: { data?: unknown }) => void,
  ): void
}

export type SocketFactory = (url: string) => SocketLike

export interface RoomClientHandlers {
  onMessage: (message: ServerMessage) => void
  onStatus: (status: Status) => void
}

/** Waits between reconnect attempts: doubles from the first up to the cap. */
export const RECONNECT_FIRST_MS = 1000
export const RECONNECT_CAP_MS = 10_000

const openSocket: SocketFactory = (url) => new WebSocket(url)

/**
 * One connection to one room. Opens the socket, sends the introduction once it is open, and
 * after the room answers with a welcome switches the introduction to a resume with the token,
 * so every reconnect takes the same seat back. Only close() stops it from reconnecting.
 */
export class RoomClient {
  private socket: SocketLike | null = null
  private intro: ClientMessage | null = null
  private open = false
  private stopped = false
  private attempts = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly url: string
  private readonly handlers: RoomClientHandlers
  private readonly factory: SocketFactory

  constructor(url: string, handlers: RoomClientHandlers, factory: SocketFactory = openSocket) {
    this.url = url
    this.handlers = handlers
    this.factory = factory
  }

  connect(): void {
    if (this.stopped || this.socket) return
    this.handlers.onStatus('connecting')
    const socket = this.factory(this.url)
    this.socket = socket
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return
      this.open = true
      this.attempts = 0
      this.handlers.onStatus('open')
      if (this.intro) socket.send(JSON.stringify(this.intro))
    })
    socket.addEventListener('message', (event) => {
      if (this.socket !== socket) return
      const message = parseServerMessage(event.data)
      if (!message) return
      if (message.type === 'welcome') this.intro = { type: 'resume', token: message.token }
      this.handlers.onMessage(message)
    })
    socket.addEventListener('close', () => this.dropped(socket))
    socket.addEventListener('error', () => this.dropped(socket))
  }

  join(name: string, garage: PlayerConfig, ticket?: string, stakes = false): void {
    this.introduce({
      type: 'join',
      name,
      garage,
      ...(ticket ? { ticket } : {}),
      ...(stakes ? { stakes: true } : {}),
    })
  }

  resume(token: string): void {
    this.introduce({ type: 'resume', token })
  }

  act(action: Action): void {
    if (this.open && this.socket) this.socket.send(JSON.stringify({ type: 'act', action }))
  }

  /** Gives the match up; the room ends it with the other seat as winner. */
  concede(): void {
    if (this.open && this.socket) this.socket.send(JSON.stringify({ type: 'concede' }))
  }

  /** Asks the room to take back this seat's last mod play of the current step. */
  undo(): void {
    if (this.open && this.socket) this.socket.send(JSON.stringify({ type: 'undo' }))
  }

  /** Stops the client for good; the room sees the socket close. */
  close(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const socket = this.socket
    this.socket = null
    this.open = false
    socket?.close()
    this.handlers.onStatus('closed')
  }

  private introduce(message: ClientMessage): void {
    this.intro = message
    if (this.open && this.socket) this.socket.send(JSON.stringify(message))
  }

  private dropped(socket: SocketLike): void {
    if (this.socket !== socket) return
    this.socket = null
    this.open = false
    if (this.stopped) return
    this.handlers.onStatus('connecting')
    const wait = Math.min(RECONNECT_FIRST_MS * 2 ** this.attempts, RECONNECT_CAP_MS)
    this.attempts += 1
    this.timer = setTimeout(() => {
      this.timer = null
      this.connect()
    }, wait)
  }
}

/** What the online match screen holds. Everything comes from the room; nothing is simulated. */
export interface OnlineSession {
  status: Status
  code: string
  seat: PlayerIndex | null
  token: string | null
  names: readonly [string, string]
  view: MatchState | null
  raceEnd: RaceEnd | null
  /** The newest view that arrived while a race end is on screen, applied on continue. */
  held: MatchState | null
  opponentConnected: boolean
  waiting: boolean
  error: string | null
  /** What the room said the seat earned, once the match ended. */
  result: ResultMessage | null
}

export type OnlineEvent =
  | { type: 'message'; message: ServerMessage }
  | { type: 'status'; status: Status }
  | { type: 'continue' }

export function startOnline(code: string, name: string): OnlineSession {
  return {
    status: 'connecting',
    code,
    seat: null,
    token: null,
    names: [name, 'Opponent'],
    view: null,
    raceEnd: null,
    held: null,
    opponentConnected: false,
    waiting: false,
    error: null,
    result: null,
  }
}

export function reduceOnline(session: OnlineSession, event: OnlineEvent): OnlineSession {
  switch (event.type) {
    case 'status':
      return { ...session, status: event.status }
    case 'continue': {
      if (session.raceEnd === null) return session
      const { held, view } = session
      if (held === null || view === null) return { ...session, raceEnd: null }
      return { ...session, view: held, held: null, raceEnd: raceEndBetween(view, held) }
    }
    case 'message':
      return onMessage(session, event.message)
  }
}

function onMessage(session: OnlineSession, message: ServerMessage): OnlineSession {
  switch (message.type) {
    case 'welcome':
      return {
        ...session,
        code: message.code,
        seat: message.seat,
        token: message.token,
        error: null,
      }
    case 'waiting':
      return { ...session, waiting: true }
    case 'presence':
      return { ...session, opponentConnected: message.opponentConnected }
    case 'error':
      return { ...session, error: message.reason }
    case 'result':
      return { ...session, result: message }
    case 'matched':
      return session
    case 'state': {
      const next = message.view
      const base = { ...session, names: message.names, waiting: false, error: null }
      if (session.raceEnd !== null) return { ...base, held: next }
      const raceEnd = session.view === null ? null : raceEndBetween(session.view, next)
      return { ...base, view: next, raceEnd }
    }
  }
}
