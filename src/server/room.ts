import {
  apply,
  createMatch,
  isLegal,
  redact,
  type Action,
  type MatchState,
  type PlayerConfig,
  type PlayerIndex,
} from '../engine/index.ts'
import type { ClientMessage, ServerMessage } from '../protocol/messages.ts'

/**
 * One online match (DESIGN.md 13), independent of any platform. The room is the only holder of
 * the full MatchState. It takes client messages, validates them, applies legal actions through
 * the engine, and hands back the messages to send, each addressed to a seat. Persistence and
 * sockets are the adapter's job; the room can be rebuilt from its snapshot at any time.
 */

export interface Seat {
  name: string
  garage: PlayerConfig
  token: string
  connected: boolean
}

export interface RoomSnapshot {
  code: string
  seed: number
  seats: readonly [Seat | null, Seat | null]
  state: MatchState | null
}

export interface Outbound {
  /** The seat to deliver to, or null for whoever sent the message being handled. */
  to: PlayerIndex | null
  message: ServerMessage
}

export const REASONS = {
  alreadySeated: 'You already have a seat in this room.',
  full: 'This room is full.',
  badGarage: 'That garage is not legal for a match.',
  unknownToken: 'That seat could not be found. The room may have expired.',
  notSeated: 'Join the room first.',
  notStarted: 'The match has not started yet.',
  notYourSeat: 'That action belongs to the other seat.',
  illegal: 'That move is not legal right now.',
  over: 'The match is over.',
} as const

function otherSeat(seat: PlayerIndex): PlayerIndex {
  return seat === 0 ? 1 : 0
}

export class Room {
  private seats: [Seat | null, Seat | null]
  private state: MatchState | null
  readonly code: string
  readonly seed: number

  constructor(code: string, seed: number, snapshot?: RoomSnapshot) {
    this.code = snapshot?.code ?? code
    this.seed = snapshot?.seed ?? seed
    this.seats = snapshot ? [snapshot.seats[0], snapshot.seats[1]] : [null, null]
    this.state = snapshot?.state ?? null
  }

  snapshot(): RoomSnapshot {
    return { code: this.code, seed: this.seed, seats: [...this.seats], state: this.state }
  }

  get started(): boolean {
    return this.state !== null
  }

  seatOf(token: string): PlayerIndex | null {
    if (this.seats[0]?.token === token) return 0
    if (this.seats[1]?.token === token) return 1
    return null
  }

  private names(): [string, string] {
    return [this.seats[0]?.name ?? 'Player 1', this.seats[1]?.name ?? 'Player 2']
  }

  /** Both seats' current views, or nothing before the match starts. */
  private views(): Outbound[] {
    const state = this.state
    if (!state) return []
    return ([0, 1] as const).map((seat) => ({
      to: seat,
      message: { type: 'state', view: redact(state, seat), names: this.names() },
    }))
  }

  private presenceFor(seat: PlayerIndex): Outbound {
    return {
      to: seat,
      message: {
        type: 'presence',
        opponentConnected: this.seats[otherSeat(seat)]?.connected ?? false,
      },
    }
  }

  /**
   * Handles one message from a socket. `from` is the seat that socket holds, or null before it
   * joins. `newToken` supplies reconnect tokens so the room stays free of randomness of its own.
   */
  handle(from: PlayerIndex | null, message: ClientMessage, newToken: () => string): Outbound[] {
    switch (message.type) {
      case 'join':
        return this.join(from, message.name, message.garage, newToken)
      case 'resume':
        return this.resume(message.token)
      case 'act':
        return this.act(from, message.action)
    }
  }

  private join(
    from: PlayerIndex | null,
    name: string,
    garage: PlayerConfig,
    newToken: () => string,
  ): Outbound[] {
    if (from !== null) return [fail(REASONS.alreadySeated)]
    const seat: PlayerIndex | null = this.seats[0] === null ? 0 : this.seats[1] === null ? 1 : null
    if (seat === null) return [fail(REASONS.full)]
    if (!legalGarage(garage)) return [fail(REASONS.badGarage)]
    const token = newToken()
    this.seats[seat] = { name, garage, token, connected: true }
    const out: Outbound[] = [
      { to: null, message: { type: 'welcome', code: this.code, seat, token } },
      this.presenceFor(otherSeat(seat)),
      this.presenceFor(seat),
    ]
    const [a, b] = this.seats
    if (a && b && !this.state) {
      this.state = createMatch({ players: [a.garage, b.garage] }, this.seed)
      out.push(...this.views())
    } else if (!this.state) {
      out.push({ to: null, message: { type: 'waiting' } })
    }
    return out
  }

  private resume(token: string): Outbound[] {
    const seat = this.seatOf(token)
    if (seat === null) return [fail(REASONS.unknownToken)]
    const held = this.seats[seat]
    if (held) this.seats[seat] = { ...held, connected: true }
    const out: Outbound[] = [
      { to: null, message: { type: 'welcome', code: this.code, seat, token } },
      this.presenceFor(otherSeat(seat)),
      this.presenceFor(seat),
    ]
    if (this.state) {
      out.push({
        to: null,
        message: { type: 'state', view: redact(this.state, seat), names: this.names() },
      })
    } else {
      out.push({ to: null, message: { type: 'waiting' } })
    }
    return out
  }

  private act(from: PlayerIndex | null, action: Action): Outbound[] {
    if (from === null) return [fail(REASONS.notSeated)]
    const state = this.state
    if (!state) return [fail(REASONS.notStarted)]
    if (state.phase.kind === 'over') return [fail(REASONS.over)]
    if (action.player !== from) return [fail(REASONS.notYourSeat)]
    if (!isLegal(state, action)) return [fail(REASONS.illegal)]
    this.state = apply(state, action)
    return this.views()
  }

  /** A socket for the seat closed and no other socket holds it. */
  disconnect(seat: PlayerIndex): Outbound[] {
    const held = this.seats[seat]
    if (!held) return []
    this.seats[seat] = { ...held, connected: false }
    return [this.presenceFor(otherSeat(seat))]
  }
}

function fail(reason: string): Outbound {
  return { to: null, message: { type: 'error', reason } }
}

/** A garage the engine will accept: tried against itself with a throwaway seed. */
export function legalGarage(garage: PlayerConfig): boolean {
  try {
    createMatch({ players: [garage, garage] }, 1)
    return true
  } catch {
    return false
  }
}
