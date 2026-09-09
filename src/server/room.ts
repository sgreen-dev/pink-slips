import {
  apply,
  concede,
  createMatch,
  currentPlayer,
  forfeit,
  isLegal,
  isOver,
  redact,
  rngFromHex,
  seedRng,
  TUNABLES,
  type Action,
  type MatchState,
  type PlayerConfig,
  type PlayerIndex,
  type RngState,
} from '../engine/index.ts'
import { stakesTransfer, type Transfer } from '../collection/stakes.ts'
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
  /** Laps taken, for the plate both seats see (DESIGN.md 12). */
  laps?: number
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
  /** The first match's generator state. Older snapshots carry a plain number. */
  seed: RngState | number
  seats: readonly [Seat | null, Seat | null]
  state: MatchState | null
  tickets?: readonly [Ticket, Ticket] | null
  reported?: boolean
  /** States from before each mod play in the current mod step, with the seat that played. */
  history?: readonly { seat: PlayerIndex; state: MatchState }[]
  /** True when the room plays for stakes (DESIGN.md 12). */
  stakes?: boolean
  /** Matches started in this room. */
  matches?: number
  /** Which seats have asked for a rematch of the finished match. */
  rematch?: readonly [boolean, boolean]
  /**
   * When the seat on turn forfeits, in epoch ms, or null when nothing is timed (DESIGN.md 13).
   * Absolute so it survives a rebuild; the wire carries a remainder instead.
   */
  deadline?: number | null
  /** When the seat on turn dropped, while the countdown is paused for it. */
  pausedAt?: number | null
  /** Pause credit left this turn, so reconnecting on a loop cannot stall forever. */
  graceLeft?: number
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
  /** True when the match ended by a concede or a timeout rather than three pink slips. */
  conceded: boolean
  /** Races that reached the line, so a match given up before any race earns nothing. */
  racesPlayed: number
  /** Each seat's stakes transfer, seat 0 first, or null when the room played for none. */
  transfers: readonly [Transfer, Transfer] | null
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
  stakesOn: 'This room plays for stakes. Turn stakes on to join it.',
  stakesOff: 'This room does not play for stakes. Turn stakes off to join it.',
  stakesNeedsPlayer: 'Stakes need a signed-in player on both seats. Create a player first.',
  notOver: 'The match is still running.',
  noRematchRanked: 'A ranked match is not replayed in its room. Queue again.',
  noRematchStakes:
    'A stakes match is not replayed in its room, since cars changed hands. Make a new room.',
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
  private forStakes: boolean
  private matches: number
  private wants: [boolean, boolean]
  private deadline: number | null
  private pausedAt: number | null
  private graceLeft: number
  private readonly t: typeof TUNABLES
  readonly code: string
  readonly seed: RngState

  /** A number seed names a run, for the tests; a real room is opened with a full state. */
  constructor(
    code: string,
    seed: RngState | number,
    snapshot?: RoomSnapshot,
    t: typeof TUNABLES = TUNABLES,
  ) {
    this.t = t
    this.code = snapshot?.code ?? code
    // A room opened before the generator widened stored a number; expand it rather than
    // dropping the room, which would strand a match in progress.
    const saved = snapshot?.seed ?? seed
    this.seed = typeof saved === 'number' ? seedRng(saved) : saved
    this.seats = snapshot ? [snapshot.seats[0], snapshot.seats[1]] : [null, null]
    this.state = snapshot?.state ?? null
    this.tickets = snapshot?.tickets ? [snapshot.tickets[0], snapshot.tickets[1]] : null
    this.reported = snapshot?.reported ?? false
    this.history = snapshot?.history ? [...snapshot.history] : []
    this.forStakes = snapshot?.stakes ?? false
    this.matches = snapshot?.matches ?? (this.state ? 1 : 0)
    this.wants = snapshot?.rematch ? [snapshot.rematch[0], snapshot.rematch[1]] : [false, false]
    this.deadline = snapshot?.deadline ?? null
    this.pausedAt = snapshot?.pausedAt ?? null
    this.graceLeft = snapshot?.graceLeft ?? t.online.disconnectGraceMs
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
      stakes: this.forStakes,
      matches: this.matches,
      rematch: [this.wants[0], this.wants[1]],
      deadline: this.deadline,
      pausedAt: this.pausedAt,
      graceLeft: this.graceLeft,
    }
  }

  get started(): boolean {
    return this.state !== null
  }

  get ranked(): boolean {
    return this.tickets !== null
  }

  get stakes(): boolean {
    return this.forStakes
  }

  /** Reserves the seats for two ticket holders. Only an empty, unstarted room can be set up. */
  setup(tickets: readonly [Ticket, Ticket], stakes = false): boolean {
    if (this.state || this.seats[0] || this.seats[1] || this.tickets) return false
    this.tickets = [tickets[0], tickets[1]]
    this.forStakes = stakes
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

  /** Each seat's laps for its plate; a guest, whom the room cannot know, shows none. */
  private plates(): [number, number] {
    return [this.seats[0]?.identity?.laps ?? 0, this.seats[1]?.identity?.laps ?? 0]
  }

  /**
   * The countdown (DESIGN.md 13). Only a ranked room is timed: a friend match is casual and
   * waiting for someone to come back to it is the point. Null once the match is over.
   */
  private timed(): boolean {
    return this.tickets !== null && this.state !== null && this.state.phase.kind !== 'over'
  }

  /** Starts the seat on turn's clock again, with a fresh pause allowance for the new turn. */
  private armDeadline(now: number): void {
    if (!this.timed()) {
      this.deadline = null
      this.pausedAt = null
      return
    }
    const seat = currentPlayer(this.state as MatchState)
    this.deadline = now + this.t.online.turnLimitMs
    this.graceLeft = this.t.online.disconnectGraceMs
    this.pausedAt = seat !== null && this.seats[seat]?.connected === false ? now : null
  }

  /**
   * How long the seat on turn has left, or null when nothing is timed. A pause adds back the
   * time spent disconnected, but only as far as the turn's remaining allowance.
   */
  msLeft(now: number): number | null {
    if (this.deadline === null) return null
    const credit = this.pausedAt === null ? 0 : Math.min(now - this.pausedAt, this.graceLeft)
    return Math.max(0, this.deadline + credit - now)
  }

  /**
   * When the adapter should wake the room, or null when nothing is timed. While a seat is
   * paused this is the latest the clock could run out, since the allowance is capped.
   */
  alarmAt(): number | null {
    if (this.deadline === null) return null
    return this.deadline + (this.pausedAt === null ? 0 : this.graceLeft)
  }

  /**
   * The clock ran out: the seat on turn forfeits and the other seat wins, reported like any
   * other result. Nothing happens while time is left, so a late alarm is harmless.
   */
  timeout(now: number): Outbound[] {
    const state = this.state
    if (!state || !this.timed()) return []
    const left = this.msLeft(now)
    if (left === null || left > 0) return []
    const seat = currentPlayer(state)
    if (seat === null) return []
    this.state = forfeit(state, seat)
    this.history = []
    this.deadline = null
    this.pausedAt = null
    return this.views(now)
  }

  /** Both seats' current views, or nothing before the match starts. */
  private views(now: number): Outbound[] {
    const state = this.state
    if (!state) return []
    return ([0, 1] as const).map((seat) => ({
      to: seat,
      message: {
        type: 'state',
        view: redact(state, seat),
        names: this.names(),
        plates: this.plates(),
        turnMsLeft: this.msLeft(now),
      },
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
    now: number = Date.now(),
  ): Outbound[] {
    switch (message.type) {
      case 'join':
        return this.join(from, message, newToken, identity, now)
      case 'resume':
        return this.resume(message.token, now)
      case 'act':
        return this.act(from, message.action, now)
      case 'undo':
        return this.undo(from, now)
      case 'concede':
        return this.concede(from, now)
      case 'rematch':
        return this.rematch(from, newToken, now)
    }
  }

  private join(
    from: PlayerIndex | null,
    message: { name: string; garage: PlayerConfig; ticket?: string; stakes?: boolean },
    newToken: () => string,
    identity: SeatIdentity | null,
    now: number,
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
    // A friend room's first player sets its stakes; everyone after must match, and a stakes
    // room seats only signed-in players, since only an account can gain or lose a car.
    if (!this.tickets) {
      const wants = message.stakes === true
      const empty = this.seats[0] === null && this.seats[1] === null
      if (empty) {
        if (wants && !who) return [fail(REASONS.stakesNeedsPlayer)]
        this.forStakes = wants
      } else if (wants !== this.forStakes) {
        return [fail(this.forStakes ? REASONS.stakesOn : REASONS.stakesOff)]
      } else if (this.forStakes && !who) {
        return [fail(REASONS.stakesNeedsPlayer)]
      }
    }
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
      this.matches = 1
      this.armDeadline(now)
      out.push(...this.views(now))
    } else if (!this.state) {
      out.push({ to: null, message: { type: 'waiting' } })
    }
    return out
  }

  private resume(token: string, now: number): Outbound[] {
    const seat = this.seatOf(token)
    if (seat === null) return [fail(REASONS.unknownToken)]
    const held = this.seats[seat]
    if (held) this.seats[seat] = { ...held, connected: true }
    // Coming back gives the paused time back, up to the turn's allowance, then the clock runs.
    if (this.pausedAt !== null && currentPlayer(this.state as MatchState) === seat) {
      const credit = Math.min(now - this.pausedAt, this.graceLeft)
      if (this.deadline !== null) this.deadline += credit
      this.graceLeft -= credit
      this.pausedAt = null
    }
    const out: Outbound[] = [
      { to: null, message: { type: 'welcome', code: this.code, seat, token } },
      this.presenceFor(otherSeat(seat)),
      this.presenceFor(seat),
    ]
    if (this.state) {
      out.push({
        to: null,
        message: {
          type: 'state',
          view: redact(this.state, seat),
          names: this.names(),
          plates: this.plates(),
          turnMsLeft: this.msLeft(now),
        },
      })
    } else {
      out.push({ to: null, message: { type: 'waiting' } })
    }
    return out
  }

  private act(from: PlayerIndex | null, action: Action, now: number): Outbound[] {
    if (from === null) return [fail(REASONS.notSeated)]
    const state = this.state
    if (!state) return [fail(REASONS.notStarted)]
    if (state.phase.kind === 'over') return [fail(REASONS.over)]
    if (action.player !== from) return [fail(REASONS.notYourSeat)]
    if (!isLegal(state, action)) return [fail(REASONS.illegal)]
    const keep = isModPlay(action) && state.phase.kind === 'turn' && state.turn.step === 'mods'
    this.history = keep ? [...this.history, { seat: from, state }] : []
    this.state = apply(state, action)
    this.armDeadline(now)
    return this.views(now)
  }

  /** The seat gives the match up: the other seat wins, and both see the finished state. */
  private concede(from: PlayerIndex | null, now: number): Outbound[] {
    if (from === null) return [fail(REASONS.notSeated)]
    const state = this.state
    if (!state) return [fail(REASONS.notStarted)]
    if (state.phase.kind === 'over') return [fail(REASONS.over)]
    this.state = concede(state, from)
    this.history = []
    this.deadline = null
    this.pausedAt = null
    return this.views(now)
  }

  /**
   * Another match in the same room (DESIGN.md 13): once both seats ask, the same garages race
   * again with fresh randomness and the first move given to the other seat. A ranked room
   * queues again instead, and a stakes room makes a new room, since its cars changed hands.
   *
   * The state comes from `newToken`, the platform randomness the room is handed, and not from
   * the previous match's: a derived seed would mean that reading one match reads every rematch
   * after it (DESIGN.md 13).
   */
  private rematch(from: PlayerIndex | null, newToken: () => string, now: number): Outbound[] {
    if (from === null) return [fail(REASONS.notSeated)]
    const state = this.state
    if (!state) return [fail(REASONS.notStarted)]
    if (state.phase.kind !== 'over') return [fail(REASONS.notOver)]
    if (this.tickets) return [fail(REASONS.noRematchRanked)]
    if (this.forStakes) return [fail(REASONS.noRematchStakes)]
    this.wants[from] = true
    const accepted: [boolean, boolean] = [this.wants[0], this.wants[1]]
    const out: Outbound[] = ([0, 1] as const).map((seat) => ({
      to: seat,
      message: { type: 'rematch', accepted },
    }))
    const [a, b] = this.seats
    if (!accepted[0] || !accepted[1] || !a || !b) return out
    this.matches += 1
    this.state = createMatch(
      { players: [a.garage, b.garage], firstPlayer: otherSeat(state.firstPlayer) },
      rngFromHex(newToken()),
    )
    this.history = []
    this.reported = false
    this.wants = [false, false]
    this.armDeadline(now)
    return [...out, ...this.views(now)]
  }

  /** Takes back the seat's last mod play of this step and shows both seats the result. */
  private undo(from: PlayerIndex | null, now: number): Outbound[] {
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
    return this.views(now)
  }

  /** A socket for the seat closed and no other socket holds it. */
  disconnect(seat: PlayerIndex, now: number = Date.now()): Outbound[] {
    const held = this.seats[seat]
    if (!held) return []
    this.seats[seat] = { ...held, connected: false }
    // The seat on turn stops the clock, but only until its allowance runs out.
    if (
      this.pausedAt === null &&
      this.timed() &&
      currentPlayer(this.state as MatchState) === seat
    ) {
      this.pausedAt = now
    }
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
      conceded: ['concede', 'timeout'].includes(this.state.log.at(-1)?.kind ?? ''),
      racesPlayed: this.state.players[0].pinkSlips.length + this.state.players[1].pinkSlips.length,
      transfers: this.forStakes ? stakesTransfer(this.state) : null,
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
