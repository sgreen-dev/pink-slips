import {
  apply,
  createMatch,
  currentPlayer,
  isLegal,
  isOver,
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
 *
 * A room made by the matchmaking queue is ranked: it is set up with one ticket per seat, seats
 * only the ticket holders, and names them from their accounts. Any room can hold an account
 * identity per seat, so the result can be reported for packs and, when ranked, ratings.
 */

export interface SeatIdentity {
  accountId: string
  name: string
}

export interface Ticket {
  ticket: string
  identity: SeatIdentity
}

export interface Seat {
  name: string
  garage: PlayerConfig
  token: string
  connected: boolean
  identity?: SeatIdentity | null
}

export interface RoomSnapshot {
  code: string
  seed: number
  seats: readonly [Seat | null, Seat | null]
  state: MatchState | null
  tickets?: readonly [Ticket, Ticket] | null
  reported?: boolean
  /** States from before each mod play in the current mod step, with the seat that played. */
  history?: readonly { seat: PlayerIndex; state: MatchState }[]
}

export interface Outbound {
  /** The seat to deliver to, or null for whoever sent the message being handled. */
  to: PlayerIndex | null
  message: ServerMessage
}

/** Who won and lost, by account, handed out once when the match is over. */
export interface RoomResult {
  ranked: boolean
  winner: SeatIdentity | null
  loser: SeatIdentity | null
  winnerSeat: PlayerIndex
}

export const REASONS = {
  alreadySeated: 'You already have a seat in this room.',
  full: 'This room is full.',
  badGarage: 'That garage is not legal for a match.',
  badTicket: 'This match is reserved for the two players the queue matched.',
  unknownToken: 'That seat could not be found. The room may have expired.',
  notSeated: 'Join the room first.',
  notStarted: 'The match has not started yet.',
  notYourSeat: 'That action belongs to the other seat.',
  illegal: 'That move is not legal right now.',
  over: 'The match is over.',
  nothingToUndo: 'There is no mod play of yours to take back.',
} as const

function isModPlay(action: Action): boolean {
  return action.type === 'playPart' || action.type === 'playBoost' || action.type === 'playSabotage'
}

function otherSeat(seat: PlayerIndex): PlayerIndex {
  return seat === 0 ? 1 : 0
}

export class Room {
  private seats: [Seat | null, Seat | null]
  private state: MatchState | null
  private tickets: [Ticket, Ticket] | null
  private reported: boolean
  private history: { seat: PlayerIndex; state: MatchState }[]
  readonly code: string
  readonly seed: number

  constructor(code: string, seed: number, snapshot?: RoomSnapshot) {
    this.code = snapshot?.code ?? code
    this.seed = snapshot?.seed ?? seed
    this.seats = snapshot ? [snapshot.seats[0], snapshot.seats[1]] : [null, null]
    this.state = snapshot?.state ?? null
    this.tickets = snapshot?.tickets ? [snapshot.tickets[0], snapshot.tickets[1]] : null
    this.reported = snapshot?.reported ?? false
    this.history = snapshot?.history ? [...snapshot.history] : []
  }

  snapshot(): RoomSnapshot {
    return {
      code: this.code,
      seed: this.seed,
      seats: [...this.seats],
      state: this.state,
      tickets: this.tickets ? [...this.tickets] : null,
      reported: this.reported,
      history: [...this.history],
    }
  }

  get started(): boolean {
    return this.state !== null
  }

  get ranked(): boolean {
    return this.tickets !== null
  }

  /** Reserves the seats for two ticket holders. Only an empty, unstarted room can be set up. */
  setup(tickets: readonly [Ticket, Ticket]): boolean {
    if (this.state || this.seats[0] || this.seats[1] || this.tickets) return false
    this.tickets = [tickets[0], tickets[1]]
    return true
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
   * `identity` is the signed-in account behind the socket, when the adapter knows one.
   */
  handle(
    from: PlayerIndex | null,
    message: ClientMessage,
    newToken: () => string,
    identity: SeatIdentity | null = null,
  ): Outbound[] {
    switch (message.type) {
      case 'join':
        return this.join(from, message, newToken, identity)
      case 'resume':
        return this.resume(message.token)
      case 'act':
        return this.act(from, message.action)
      case 'undo':
        return this.undo(from)
    }
  }

  private join(
    from: PlayerIndex | null,
    message: { name: string; garage: PlayerConfig; ticket?: string },
    newToken: () => string,
    identity: SeatIdentity | null,
  ): Outbound[] {
    if (from !== null) return [fail(REASONS.alreadySeated)]
    let seat: PlayerIndex
    let name = message.name
    let who = identity
    if (this.tickets) {
      const index = this.tickets.findIndex((t) => t.ticket === message.ticket)
      if (index < 0) return [fail(REASONS.badTicket)]
      seat = index === 0 ? 0 : 1
      if (this.seats[seat] !== null) return [fail(REASONS.full)]
      who = this.tickets[seat].identity
      name = who.name
    } else if (this.seats[0] === null) {
      seat = 0
    } else if (this.seats[1] === null) {
      seat = 1
    } else {
      return [fail(REASONS.full)]
    }
    if (!legalGarage(message.garage)) return [fail(REASONS.badGarage)]
    const token = newToken()
    this.seats[seat] = { name, garage: message.garage, token, connected: true, identity: who }
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
    const keep = isModPlay(action) && state.phase.kind === 'turn' && state.turn.step === 'mods'
    this.history = keep ? [...this.history, { seat: from, state }] : []
    this.state = apply(state, action)
    return this.views()
  }

  /** Takes back the seat's last mod play of this step and shows both seats the result. */
  private undo(from: PlayerIndex | null): Outbound[] {
    if (from === null) return [fail(REASONS.notSeated)]
    const state = this.state
    if (!state) return [fail(REASONS.notStarted)]
    const last = this.history[this.history.length - 1]
    const open = state.phase.kind === 'turn' && state.turn.step === 'mods'
    if (!last || last.seat !== from || !open || currentPlayer(state) !== from) {
      return [fail(REASONS.nothingToUndo)]
    }
    this.history = this.history.slice(0, -1)
    this.state = last.state
    return this.views()
  }

  /** A socket for the seat closed and no other socket holds it. */
  disconnect(seat: PlayerIndex): Outbound[] {
    const held = this.seats[seat]
    if (!held) return []
    this.seats[seat] = { ...held, connected: false }
    return [this.presenceFor(otherSeat(seat))]
  }

  /**
   * The finished match's result, once. Null while the match runs, and null again after it has
   * been taken, so the adapter reports each match one time.
   */
  takeResult(): RoomResult | null {
    if (!this.state || this.reported) return null
    const winner = isOver(this.state)
    if (winner === null) return null
    this.reported = true
    return {
      ranked: this.tickets !== null,
      winner: this.seats[winner]?.identity ?? null,
      loser: this.seats[otherSeat(winner)]?.identity ?? null,
      winnerSeat: winner,
    }
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
