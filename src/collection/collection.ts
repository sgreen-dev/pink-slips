import { CARS } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { STARTERS } from '../data/starters.ts'
import { TIERS, type Tier } from '../data/types.ts'
import { nextFloat, nextInt, TUNABLES, type RngState } from '../engine/index.ts'

/**
 * The collection: how many copies of each card a player owns, and the packs that add to it
 * (DESIGN.md 12). Pure functions; persistence lives in persist.ts. The engine never sees any
 * of this: a match config is still card ids only.
 */

/** Copies owned per card id, cars and mods alike. A missing id means none. */
export type Collection = Readonly<Record<string, number>>

export const ALL_CARD_IDS: readonly string[] = [
  ...CARS.map((car) => car.id),
  ...MODS.map((mod) => mod.id),
]

export type Mode = 'cpu' | 'hotseat'

export function countIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/**
 * What a fresh browser owns: every card in every starter garage, with as many copies as the
 * starter deck that uses it most, so each starter can always be rebuilt.
 */
export function starterCollection(): Collection {
  const owned: Record<string, number> = {}
  for (const starter of STARTERS) {
    for (const [id, count] of countIds([...starter.cars, ...starter.deck])) {
      owned[id] = Math.max(owned[id] ?? 0, count)
    }
  }
  return owned
}

export function copiesOwned(collection: Collection, id: string): number {
  return collection[id] ?? 0
}

export function owns(collection: Collection, id: string): boolean {
  return copiesOwned(collection, id) > 0
}

/** Adds one copy per id; an id listed twice adds two. */
export function grant(collection: Collection, ids: readonly string[]): Collection {
  const next: Record<string, number> = { ...collection }
  for (const id of ids) next[id] = (next[id] ?? 0) + 1
  return next
}

/** Tops the collection up so the garage can be built: one of each car, a deck's copies of each mod. */
export function grantGarage(
  collection: Collection,
  cars: readonly string[],
  deck: readonly string[],
): Collection {
  let next = collection
  const needed = [...cars.map((id) => [id, 1] as const), ...countIds(deck)]
  for (const [id, count] of needed) {
    const short = count - copiesOwned(next, id)
    if (short > 0)
      next = grant(
        next,
        Array.from({ length: short }, () => id),
      )
  }
  return next
}

/** How many distinct cards the collection holds at least one copy of. */
export function ownedCount(collection: Collection): number {
  return ALL_CARD_IDS.filter((id) => owns(collection, id)).length
}

export interface Pack {
  cars: string[]
  mods: string[]
}

export function packCards(pack: Pack): string[] {
  return [...pack.cars, ...pack.mods]
}

const CARS_BY_TIER: ReadonlyMap<Tier, readonly string[]> = new Map(
  TIERS.map((tier) => [tier, CARS.filter((car) => car.tier === tier).map((car) => car.id)]),
)

export function rollTier(
  state: RngState,
  odds: Readonly<Record<Tier, number>> = TUNABLES.collection.carTierOdds,
): [Tier, RngState] {
  const [roll, next] = nextFloat(state)
  let acc = 0
  for (const tier of TIERS) {
    acc += odds[tier]
    if (roll < acc) return [tier, next]
  }
  return [TIERS[TIERS.length - 1] ?? 'daily', next]
}

function pick(state: RngState, items: readonly string[]): [string, RngState] {
  const [index, next] = nextInt(state, items.length)
  const item = items[index]
  if (item === undefined) throw new Error('Nothing to pick from')
  return [item, next]
}

/** Opens one pack: car slots roll a tier by the odds, then a car in it; mod slots are uniform. */
export function openPack(state: RngState, t: typeof TUNABLES = TUNABLES): [Pack, RngState] {
  const cars: string[] = []
  const mods: string[] = []
  let rng = state
  for (let i = 0; i < t.collection.packCars; i++) {
    let tier: Tier
    ;[tier, rng] = rollTier(rng, t.collection.carTierOdds)
    let car: string
    ;[car, rng] = pick(rng, CARS_BY_TIER.get(tier) ?? ALL_CARD_IDS)
    cars.push(car)
  }
  const modIds = MODS.map((mod) => mod.id)
  for (let i = 0; i < t.collection.packMods; i++) {
    let mod: string
    ;[mod, rng] = pick(rng, modIds)
    mods.push(mod)
  }
  return [{ cars, mods }, rng]
}

/** Packs a finished match earns. Beating the CPU pays more; hotseat pays the base. */
export function packsEarned(mode: Mode, humanWon: boolean, t: typeof TUNABLES = TUNABLES): number {
  return mode === 'cpu' && humanWon ? t.collection.packsPerCpuWin : t.collection.packsPerMatch
}
