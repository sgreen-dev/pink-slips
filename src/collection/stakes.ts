import { CARS, getCar } from '../data/cars.ts'
import { STARTERS } from '../data/starters.ts'
import { TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'
import { grant, type Collection } from './collection.ts'

/**
 * Stakes (DESIGN.md 12): with the toggle on, every pink slip taken during a match changes
 * hands for real when it ends. The captor's collection gains a copy of the car and the owner's
 * loses one, whoever won the match. Starter cars are exempt both ways, so the starters always
 * rebuild. These are the pure pieces; the browser, the directory, and the room apply them.
 */

export interface Transfer {
  /** Cars this player captured and now keeps. */
  gained: string[]
  /** Cars the other player captured from this one. */
  lost: string[]
}

export const EMPTY_TRANSFER: Transfer = { gained: [], lost: [] }

/** Every car in a starter garage. Exempt from stakes in both directions. */
export const STARTER_CAR_IDS: ReadonlySet<string> = new Set(STARTERS.flatMap((s) => s.cars))

const CAR_IDS: ReadonlySet<string> = new Set(CARS.map((car) => car.id))

/** True for a real car that stakes can move: any car outside the starter garages. */
export function isStakedCar(id: string): boolean {
  return CAR_IDS.has(id) && !STARTER_CAR_IDS.has(id)
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

/** Applies a transfer to a collection: a gain adds a copy, a loss takes one, never below zero. */
export function applyTransfer(collection: Collection, transfer: Transfer): Collection {
  const next: Record<string, number> = { ...grant(collection, transfer.gained) }
  for (const id of transfer.lost) {
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

export function isEmptyTransfer(transfer: Transfer): boolean {
  return transfer.gained.length === 0 && transfer.lost.length === 0
}

/** Car names for a result line, in order, joined for prose. */
export function carNames(ids: readonly string[]): string {
  const names = ids.map((id) => getCar(id).name)
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
