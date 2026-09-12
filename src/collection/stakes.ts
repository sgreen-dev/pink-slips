import { CARS, getCar } from '../data/cars.ts'
import { STARTERS } from '../data/starters.ts'
import { TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'
import { grant, type Collection } from './collection.ts'

/**
 * Pink Slips Mode (DESIGN.md 12), called stakes in the code: with it on, every pink slip taken
 * during a match changes hands for real when it ends. The captor's collection gains a copy of the
 * car and the owner's loses one, whoever won the match. Loaner cars are exempt both ways, so a
 * collection can never be emptied. It is an online mode, so the room and the directory apply
 * these; a CPU or hotseat match never moves a card.
 */

export interface Transfer {
  /** Cars this player captured and now keeps. */
  gained: string[]
  /** Cars the other player captured from this one. */
  lost: string[]
}

export const EMPTY_TRANSFER: Transfer = { gained: [], lost: [] }

/**
 * Every car in a loaner garage, which includes every intro-set car. Exempt from stakes in both
 * directions: a loaner car is not owned so it can be neither won nor lost, and the intro cars
 * inside it are what stops a collection being emptied.
 */
export const LOANER_CAR_IDS: ReadonlySet<string> = new Set(STARTERS.flatMap((s) => s.cars))

const CAR_IDS: ReadonlySet<string> = new Set(CARS.map((car) => car.id))

/** True for a real car that stakes can move: any car outside the loaner garages. */
export function isStakedCar(id: string): boolean {
  return CAR_IDS.has(id) && !LOANER_CAR_IDS.has(id)
}

/** The cars in a list that stakes can move, capped at the pink slips one match can hold. */
function staked(ids: readonly string[]): string[] {
  return ids.filter(isStakedCar).slice(0, TUNABLES.pinkSlipsToWin)
}

/**
 * Each seat's transfer at the end of a match: what it took, and what the other seat took
 * from it. Seat 0 first, as the players are.
 */
export function stakesTransfer(state: MatchState): [Transfer, Transfer] {
  const slips = (seat: PlayerIndex) => staked(state.players[seat].pinkSlips)
  const first = slips(0)
  const second = slips(1)
  return [
    { gained: first, lost: second },
    { gained: second, lost: first },
  ]
}

/**
 * Applies a transfer to a collection: a gain adds a copy, a loss takes one, never below zero.
 * A car held in `keep` (the keepsakes in chrome) is never lost.
 */
export function applyTransfer(
  collection: Collection,
  transfer: Transfer,
  keep: Collection = {},
): Collection {
  const next: Record<string, number> = { ...grant(collection, transfer.gained) }
  for (const id of transfer.lost) {
    if ((keep[id] ?? 0) > 0) continue
    const have = next[id] ?? 0
    if (have > 0) next[id] = have - 1
  }
  return next
}

/**
 * A transfer as it arrives over the wire: two lists of strings, kept to real cars outside the
 * starters and capped, or null when the shape is wrong.
 */
export function sanitizeTransfer(value: unknown): Transfer | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const list = (item: unknown): string[] | null =>
    Array.isArray(item) && item.every((x) => typeof x === 'string')
      ? staked(item as string[])
      : null
  const gained = list(record['gained'])
  const lost = list(record['lost'])
  if (!gained || !lost) return null
  return { gained, lost }
}

/**
 * The cars each side raced, as the room reports them with a stakes result, or null when the shape
 * is wrong. Only read here; what they mean is `settleStakes`'s business.
 */
export function sanitizeRaced(value: unknown): { winner: string[]; loser: string[] } | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const list = (item: unknown): string[] | null =>
    Array.isArray(item) && item.every((x) => typeof x === 'string') ? [...(item as string[])] : null
  const winner = list(record['winner'])
  const loser = list(record['loser'])
  return winner && loser ? { winner, loser } : null
}

/** One side of a stakes settlement: its collection as it stands, and the garage it raced. */
export interface StakesSide {
  owned: Collection
  /** The keepsakes in chrome, which never change hands. */
  chrome: Collection
  /** The cars the side raced, or null when the room did not say, which settles as not owned. */
  raced: readonly string[] | null
}

/**
 * What a stakes match actually moves (DESIGN.md 12, 13), from what each side captured and what
 * each collection holds when the match is settled. Every rule keeps a car from appearing that
 * nobody lost:
 *
 * - A keepsake never changes hands, whichever side holds it. This used to look at the loser's
 *   chrome only, so a winner's keepsake the loser had captured stayed and moved at once (S23).
 * - A car moves only out of a collection that holds it: a copy its owner does not have leaves the
 *   owner's losses and the captor's gains together, rather than the captor gaining it from
 *   nothing. Copies are counted, so two captures of one car need two copies to move twice.
 * - A side that raced a car it does not own takes nothing (S16). The room seats any legal garage,
 *   so a client written for the purpose could stake cars it never opened; now that wins nothing,
 *   and whatever of its own it did stake still goes to the other side.
 */
export function settleStakes(
  transfers: { winner: Transfer; loser: Transfer },
  sides: { winner: StakesSide; loser: StakesSide },
): { winner: Transfer; loser: Transfer } {
  const winnerTakes = ownsWhatItRaced(sides.winner)
  const loserTakes = ownsWhatItRaced(sides.loser)
  return {
    winner: {
      gained: winnerTakes ? movable(sides.loser, transfers.winner.gained) : [],
      lost: loserTakes ? movable(sides.winner, transfers.winner.lost) : [],
    },
    loser: {
      gained: loserTakes ? movable(sides.winner, transfers.loser.gained) : [],
      lost: winnerTakes ? movable(sides.loser, transfers.loser.lost) : [],
    },
  }
}

/** True when the side holds every staked car it raced, a copy for each time it raced one. */
function ownsWhatItRaced(side: StakesSide): boolean {
  if (side.raced === null) return false
  const needed: Record<string, number> = {}
  for (const id of side.raced) if (isStakedCar(id)) needed[id] = (needed[id] ?? 0) + 1
  return Object.entries(needed).every(([id, count]) => (side.owned[id] ?? 0) >= count)
}

/** The cars in a list that can leave a side: held, not a keepsake, and no more often than held. */
function movable(side: StakesSide, ids: readonly string[]): string[] {
  const left: Record<string, number> = {}
  return ids.filter((id) => {
    const room = left[id] ?? ((side.chrome[id] ?? 0) > 0 ? 0 : (side.owned[id] ?? 0))
    left[id] = room - 1
    return room > 0
  })
}

export function isEmptyTransfer(transfer: Transfer): boolean {
  return transfer.gained.length === 0 && transfer.lost.length === 0
}

/** Car names for a result line, in order, joined for prose. */
export function carNames(ids: readonly string[]): string {
  const names = ids.map((id) => getCar(id).name)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
