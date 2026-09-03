import { CARS } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { STARTERS } from '../data/starters.ts'
import { TIERS, type Tier } from '../data/types.ts'
import { nextFloat, nextInt, TUNABLES, type RngState } from '../engine/index.ts'

/**
 * The collection: how many copies of each card a player owns, the foil and holo copies among
 * them, and the packs that add to it (DESIGN.md 12). Pure functions; persistence lives in
 * persist.ts. The engine never sees any of this: a match config is still card ids only.
 */

/** Copies owned per card id, cars and mods alike. A missing id means none. */
export type Collection = Readonly<Record<string, number>>

export const ALL_CARD_IDS: readonly string[] = [
  ...CARS.map((car) => car.id),
  ...MODS.map((mod) => mod.id),
]

export type Mode = 'cpu' | 'hotseat'

/** Cosmetic finish of one copy. Holo is rarer than foil; base is the plain card. */
export type Variant = 'base' | 'foil' | 'holo'

export const VARIANT_LABEL: Readonly<Record<Variant, string>> = {
  base: '',
  foil: 'Foil',
  holo: 'Holo',
}

export function countIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/**
 * What a fresh browser owns: every card in every starter garage, with as many copies as the
 * starter deck that uses it most, so each starter can always be rebuilt. All base copies.
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

/** Foil and holo copies by card id. Base copies are the rest of the collection's count. */
export interface VariantCounts {
  readonly foil: Collection
  readonly holo: Collection
}

export const NO_VARIANTS: VariantCounts = { foil: {}, holo: {} }

export function grantVariants(counts: VariantCounts, cards: readonly PackCard[]): VariantCounts {
  let { foil, holo } = counts
  for (const card of cards) {
    if (card.variant === 'foil') foil = grant(foil, [card.id])
    if (card.variant === 'holo') holo = grant(holo, [card.id])
  }
  return { foil, holo }
}

/** The finish that shows for a card: a holo copy beats a foil copy beats base. */
export function bestVariant(counts: VariantCounts, id: string): Variant {
  if (owns(counts.holo, id)) return 'holo'
  if (owns(counts.foil, id)) return 'foil'
  return 'base'
}

export interface PackCard {
  id: string
  variant: Variant
}

export interface Pack {
  cars: PackCard[]
  mods: PackCard[]
}

export function packCards(pack: Pack): PackCard[] {
  return [...pack.cars, ...pack.mods]
}

export function packIds(pack: Pack): string[] {
  return packCards(pack).map((card) => card.id)
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

/** One roll per pack card: holo first, then foil, else base. */
export function rollVariant(state: RngState, t: typeof TUNABLES = TUNABLES): [Variant, RngState] {
  const [roll, next] = nextFloat(state)
  const { holoOdds, foilOdds } = t.collection
  return [roll < holoOdds ? 'holo' : roll < holoOdds + foilOdds ? 'foil' : 'base', next]
}

function pick(state: RngState, items: readonly string[]): [string, RngState] {
  const [index, next] = nextInt(state, items.length)
  const item = items[index]
  if (item === undefined) throw new Error('Nothing to pick from')
  return [item, next]
}

/**
 * Opens one pack: car slots roll a tier by the odds, then a car in it; mod slots are uniform.
 * Every card then rolls its finish.
 */
export function openPack(state: RngState, t: typeof TUNABLES = TUNABLES): [Pack, RngState] {
  const cars: PackCard[] = []
  const mods: PackCard[] = []
  let rng = state
  const finish = (id: string): PackCard => {
    let variant: Variant
    ;[variant, rng] = rollVariant(rng, t)
    return { id, variant }
  }
  for (let i = 0; i < t.collection.packCars; i++) {
    let tier: Tier
    ;[tier, rng] = rollTier(rng, t.collection.carTierOdds)
    let car: string
    ;[car, rng] = pick(rng, CARS_BY_TIER.get(tier) ?? ALL_CARD_IDS)
    cars.push(finish(car))
  }
  const modIds = MODS.map((mod) => mod.id)
  for (let i = 0; i < t.collection.packMods; i++) {
    let mod: string
    ;[mod, rng] = pick(rng, modIds)
    mods.push(finish(mod))
  }
  return [{ cars, mods }, rng]
}

/** Packs a finished match earns. Beating the CPU pays more; hotseat pays the base. */
export function packsEarned(mode: Mode, humanWon: boolean, t: typeof TUNABLES = TUNABLES): number {
  return mode === 'cpu' && humanWon ? t.collection.packsPerCpuWin : t.collection.packsPerMatch
}
