import type { Action, MatchState, PlayerConfig, PlayerIndex } from '../engine/index.ts'
import { MAX_NAME_LENGTH, safeDisplayName } from './names.ts'

/**
 * The online protocol (DESIGN.md 13), shared by the room service and the client. Every message
 * is plain JSON. The server checks each client message with the guards below before acting.
 */

export interface JoinMessage {
  type: 'join'
  name: string
  garage: PlayerConfig
  /** From a matched message; a ranked room seats only ticket holders. */
  ticket?: string
}

export interface ResumeMessage {
  type: 'resume'
  token: string
}

export interface ActMessage {
  type: 'act'
  action: Action
}

/** Takes back the seat's last mod play of the current mod step. */
export interface UndoMessage {
  type: 'undo'
}

/** Gives the match up; the other seat wins it. */
export interface ConcedeMessage {
  type: 'concede'
}

export type ClientMessage = JoinMessage | ResumeMessage | ActMessage | UndoMessage | ConcedeMessage

export interface WelcomeMessage {
  type: 'welcome'
  code: string
  seat: PlayerIndex
  /** Presented with `resume` to take the seat back after a refresh or a dropped connection. */
  token: string
}

export interface WaitingMessage {
  type: 'waiting'
}

export interface StateMessage {
  type: 'state'
  /** The match as this seat may see it. */
  view: MatchState
  names: readonly [string, string]
}

export interface PresenceMessage {
  type: 'presence'
  opponentConnected: boolean
}

export interface ErrorMessage {
  type: 'error'
  reason: string
}

export interface RatingChange {
  before: number
  after: number
}

/** Sent once to each seat after the room reports a finished match. */
export interface ResultMessage {
  type: 'result'
  /** Packs the account was given, or null for a guest, who keeps the local rule. */
  packsEarned: number | null
  rating: RatingChange | null
}

/** The queue found an opponent; join the room with the ticket. */
export interface MatchedMessage {
  type: 'matched'
  code: string
  ticket: string
  opponent: string
}

export type ServerMessage =
  | WelcomeMessage
  | WaitingMessage
  | StateMessage
  | PresenceMessage
  | ErrorMessage
  | ResultMessage
  | MatchedMessage

export { MAX_NAME_LENGTH }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isPlayerConfig(value: unknown): value is PlayerConfig {
  return isRecord(value) && isStringArray(value['garage']) && isStringArray(value['deck'])
}

function isRatingChange(value: unknown): value is RatingChange {
  return (
    isRecord(value) && typeof value['before'] === 'number' && typeof value['after'] === 'number'
  )
}

/** Shape check only; the room checks legality against the match. */
function isAction(value: unknown): value is Action {
  if (!isRecord(value)) return false
  const player = value['player']
  return typeof value['type'] === 'string' && (player === 0 || player === 1)
}

/** Returns the message when it is well formed, otherwise null. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) return null
  switch (value['type']) {
    case 'join': {
      const name = value['name']
      if (typeof name !== 'string' || !isPlayerConfig(value['garage'])) return null
      const trimmed = safeDisplayName(name)
      const ticket = value['ticket']
      if (ticket !== undefined && typeof ticket !== 'string') return null
      const join: JoinMessage = { type: 'join', name: trimmed || 'Player', garage: value['garage'] }
      return ticket === undefined ? join : { ...join, ticket }
    }
    case 'resume':
      return typeof value['token'] === 'string' ? { type: 'resume', token: value['token'] } : null
    case 'act':
      return isAction(value['action']) ? { type: 'act', action: value['action'] } : null
    case 'undo':
      return { type: 'undo' }
    case 'concede':
      return { type: 'concede' }
    default:
      return null
  }
}

/** The client's mirror of parseClientMessage, so a bad frame never reaches the board. */
export function parseServerMessage(raw: unknown): ServerMessage | null {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!isRecord(value)) return null
  switch (value['type']) {
    case 'welcome':
      return typeof value['code'] === 'string' &&
        (value['seat'] === 0 || value['seat'] === 1) &&
        typeof value['token'] === 'string'
        ? { type: 'welcome', code: value['code'], seat: value['seat'], token: value['token'] }
        : null
    case 'waiting':
      return { type: 'waiting' }
    case 'state':
      return isRecord(value['view']) && isStringArray(value['names']) && value['names'].length === 2
        ? {
            type: 'state',
            view: value['view'] as unknown as MatchState,
            names: [value['names'][0] ?? 'Player 1', value['names'][1] ?? 'Player 2'],
          }
        : null
    case 'presence':
      return typeof value['opponentConnected'] === 'boolean'
        ? { type: 'presence', opponentConnected: value['opponentConnected'] }
        : null
    case 'error':
      return typeof value['reason'] === 'string' ? { type: 'error', reason: value['reason'] } : null
    case 'result': {
      const packs = value['packsEarned']
      const rating = value['rating']
      if (packs !== null && typeof packs !== 'number') return null
      if (rating !== null && !isRatingChange(rating)) return null
      return {
        type: 'result',
        packsEarned: packs as number | null,
        rating: rating as RatingChange | null,
      }
    }
    case 'matched':
      return typeof value['code'] === 'string' &&
        typeof value['ticket'] === 'string' &&
        typeof value['opponent'] === 'string'
        ? {
            type: 'matched',
            code: value['code'],
            ticket: value['ticket'],
            opponent: value['opponent'],
          }
        : null
    default:
      return null
  }
}

/** Room codes: six characters from an alphabet without look-alikes. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 6

export function isRoomCode(value: string): boolean {
  return value.length === CODE_LENGTH && [...value].every((c) => CODE_ALPHABET.includes(c))
}

/** Recovery codes: twelve characters from the same alphabet, shown in groups of four. */
export const RECOVERY_LENGTH = 12

export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code
}

/** A code as a player typed it: any case, dashes and spaces ignored. Null when malformed. */
export function normalizeRecoveryCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const valid = code.length === RECOVERY_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c))
  return valid ? code : null
}
