import { CARS } from '../data/cars.ts'
import { MODS, modRarity } from '../data/mods.ts'
import { INTRO_SET } from '../data/starters.ts'
import { TIERS, type Tier } from '../data/types.ts'
import { nextFloat, nextInt, TUNABLES, type RngState } from '../engine/index.ts'
import type { CollectionState, SavedGarage } from '../protocol/records.ts'

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

const COMMON_MOD_IDS: readonly string[] = MODS.filter((mod) => modRarity(mod) === 'common').map(
  (mod) => mod.id,
)
const RARE_MOD_IDS: readonly string[] = MODS.filter((mod) => modRarity(mod) === 'rare').map(
  (mod) => mod.id,
)

export type Mode = 'cpu' | 'hotseat' | 'online'

/**
 * Cosmetic finish of one copy. Holo is rarer than foil; base is the plain card. Chrome is a
 * keepsake's finish, given by a lap and never by a pack (DESIGN.md 12, Laps).
 */
export type Variant = 'base' | 'foil' | 'holo' | 'chrome'

export const VARIANT_LABEL: Readonly<Record<Variant, string>> = {
  base: '',
  foil: 'Foil',
  holo: 'Holo',
  chrome: 'Chrome',
}

const CAR_IDS: ReadonlySet<string> = new Set(CARS.map((car) => car.id))

export function countIds(ids: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/**
 * What a fresh collection owns: the intro set (DESIGN.md 12), one copy of each car and the
 * granted copies of each mod, all base. The loaner garages race without being owned, so
 * nothing here has to be able to rebuild them.
 */
export function introCollection(): Collection {
  const owned: Record<string, number> = {}
  for (const id of INTRO_SET.cars) owned[id] = 1
  for (const [id, copies] of INTRO_SET.mods) owned[id] = copies
  return owned
}

/** The grant a record was written against. 1 is the legacy loaner-garage union, 2 the intro set. */
export const GRANT_VERSION = 2

/**
 * The grant every collection started with before the intro set replaced it: the union of the
 * three loaner garages at the copies the deck using each most needed. Frozen as a literal
 * rather than read from STARTERS, so the loaner garages stay free to change without moving
 * what an old record is rebased against.
 */
const LEGACY_STARTER_GRANT: Collection = {
  'ford-mustang-gt': 1,
  'chevrolet-camaro-ss-1le': 1,
  'mazda-rx-7': 1,
  'honda-s2000': 1,
  'honda-civic-si': 1,
  'lamborghini-aventador-svj': 1,
  'ferrari-458-italia': 1,
  'mercedes-amg-gt-r': 1,
  'porsche-911-carrera-s': 1,
  'mazda-mx-5-miata': 1,
  'tesla-model-s-plaid': 1,
  'hyundai-ioniq-5-n': 1,
  'ford-f-150-raptor-r': 1,
  'subaru-wrx-sti': 1,
  'toyota-prius': 1,
  'two-step': 3,
  'anti-lag': 2,
  'perfect-launch': 3,
  'power-shift': 3,
  'drag-slicks': 2,
  'stage-2-tune': 3,
  'turbo-kit': 2,
  'pit-crew': 3,
  wheelspin: 3,
  'red-light': 2,
  'bad-tune': 2,
  roadblock: 2,
  'extra-tank': 3,
  'tow-truck': 3,
  'fuel-cell': 3,
  sponsor: 3,
  supercharger: 3,
  'carbon-body-kit': 2,
  'roll-cage': 2,
  'nitrous-shot': 3,
  'fuel-dump': 2,
  'fuel-siphon': 3,
  'missed-shift': 2,
  'parts-thief': 2,
  regen: 3,
  'launch-control': 2,
  'wheelie-bar': 2,
  'weight-reduction': 2,
  'aero-package': 2,
  overdrive: 2,
  'oil-slick': 2,
}

/**
 * Brings a collection written against the legacy grant onto the intro set: what was given free
 * is taken back, everything opened or won is kept, and the intro set is laid down under it.
 * Runs once per record, guarded by the grant version in the stored state.
 */
export function rebaseToIntro(owned: Collection): Collection {
  const next: Record<string, number> = { ...introCollection() }
  for (const [id, count] of Object.entries(owned)) {
    const earned = count - (LEGACY_STARTER_GRANT[id] ?? 0)
    if (earned > 0) next[id] = (next[id] ?? 0) + earned
  }
  return next
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

/** Complete for a lap: every car owned at least once. Mods and finishes do not count. */
export function isComplete(collection: Collection): boolean {
  return CARS.every((car) => owns(collection, car.id))
}

/** Cars in a pack after this many laps: the base count plus one per lap, capped. */
export function packCarCount(laps: number, t: typeof TUNABLES = TUNABLES): number {
  const counted = Math.min(Math.max(0, laps), t.collection.lapBonusCap)
  return t.collection.packCars + counted * t.collection.lapBonusCars
}

/**
 * Takes the lap (DESIGN.md 12, Laps): the collection returns to the intro set plus every
 * keepsake at one copy, the new one wearing chrome with the old ones, packs stay, foil and holo
 * finishes go, and the lap count rises. Null unless every car is owned and the keepsake is a
 * car the player owns.
 */
export function claimLap(state: CollectionState, keepsakeId: string): CollectionState | null {
  if (!isComplete(state.owned) || !CAR_IDS.has(keepsakeId) || !owns(state.owned, keepsakeId)) {
    return null
  }
  const chrome = owns(state.variants.chrome, keepsakeId)
    ? state.variants.chrome
    : grant(state.variants.chrome, [keepsakeId])
  let owned = introCollection()
  for (const id of Object.keys(chrome)) if (!owns(owned, id)) owned = grant(owned, [id])
  return {
    owned,
    packs: state.packs,
    variants: { foil: {}, holo: {}, chrome },
    laps: state.laps + 1,
    grantVersion: GRANT_VERSION,
  }
}

/** The saved garages that can still be built from what is owned; the rest go with the lap. */
export function garagesAfterLap(garages: readonly SavedGarage[], owned: Collection): SavedGarage[] {
  return garages.filter(
    (garage) =>
      garage.cars.every((id) => owns(owned, id)) &&
      [...countIds(garage.deck)].every(([id, count]) => copiesOwned(owned, id) >= count),
  )
}

/** Foil, holo, and chrome copies by card id. Base copies are the rest of the collection's count. */
export interface VariantCounts {
  readonly foil: Collection
  readonly holo: Collection
  readonly chrome: Collection
}

export const NO_VARIANTS: VariantCounts = { foil: {}, holo: {}, chrome: {} }

export function grantVariants(counts: VariantCounts, cards: readonly PackCard[]): VariantCounts {
  let { foil, holo, chrome } = counts
  for (const card of cards) {
    if (card.variant === 'foil') foil = grant(foil, [card.id])
    if (card.variant === 'holo') holo = grant(holo, [card.id])
    if (card.variant === 'chrome') chrome = grant(chrome, [card.id])
  }
  return { foil, holo, chrome }
}

/** The finish that shows for a card: chrome beats holo beats foil beats base. */
export function bestVariant(counts: VariantCounts, id: string): Variant {
  if (owns(counts.chrome, id)) return 'chrome'
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
 * Opens one pack: car slots roll a tier by the odds, then a car in it; mod slots roll rare at
 * the rare odds, then pick uniformly within that rarity. Every card then rolls its finish.
 */
export function openPack(
  state: RngState,
  t: typeof TUNABLES = TUNABLES,
  laps = 0,
): [Pack, RngState] {
  const cars: PackCard[] = []
  const mods: PackCard[] = []
  let rng = state
  const finish = (id: string): PackCard => {
    let variant: Variant
    ;[variant, rng] = rollVariant(rng, t)
    return { id, variant }
  }
  for (let i = 0; i < packCarCount(laps, t); i++) {
    let tier: Tier
    ;[tier, rng] = rollTier(rng, t.collection.carTierOdds)
    let car: string
    ;[car, rng] = pick(rng, CARS_BY_TIER.get(tier) ?? ALL_CARD_IDS)
    cars.push(finish(car))
  }
  for (let i = 0; i < t.collection.packMods; i++) {
    let roll: number
    ;[roll, rng] = nextFloat(rng)
    const rare = RARE_MOD_IDS.length > 0 && roll < t.collection.rareModOdds
    let mod: string
    ;[mod, rng] = pick(rng, rare ? RARE_MOD_IDS : COMMON_MOD_IDS)
    mods.push(finish(mod))
  }
  return [{ cars, mods }, rng]
}

/** Packs a finished match earns. Beating the CPU pays more; hotseat pays the base. */
export function packsEarned(mode: Mode, humanWon: boolean, t: typeof TUNABLES = TUNABLES): number {
  const earned = mode === 'cpu' || mode === 'online'
  return earned && humanWon ? t.collection.packsPerCpuWin : t.collection.packsPerMatch
}
