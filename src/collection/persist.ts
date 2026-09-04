import { seedRng } from '../engine/index.ts'
import type { CollectionState } from '../protocol/records.ts'
import {
  browserStorage,
  loadGarages,
  readRecord,
  writeRecord,
  type StorageLike,
} from '../ui/storage.ts'
import {
  NO_VARIANTS,
  grant,
  grantGarage,
  grantVariants,
  openPack,
  packCards,
  starterCollection,
  type Collection,
  type Pack,
  type VariantCounts,
} from './collection.ts'

/** The collection in localStorage, next to the garages and through the same wrapper. */

export const COLLECTION_KEY = 'pink-slips.collection.v1'

export type { CollectionState }

/** What sits in storage. Records written before phase 12 have no variants. */
interface StoredState {
  owned: Collection
  packs: number
  variants?: VariantCounts
}

function isCounts(value: unknown): value is Collection {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value as Record<string, unknown>).every((n) => typeof n === 'number')
  )
}

function isStored(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const variants = record['variants'] as Record<string, unknown> | undefined
  return (
    typeof record['packs'] === 'number' &&
    isCounts(record['owned']) &&
    (variants === undefined || (isCounts(variants['foil']) && isCounts(variants['holo'])))
  )
}

/**
 * Loads the collection. A browser without one starts with the starter cards plus every card in
 * a garage it saved before collections existed, so nothing built on v1 stops working. That
 * grant is written back at once and never repeats: from then on only packs add cards. A
 * corrupt record is replaced the same way.
 */
export function loadCollection(store: StorageLike | null = browserStorage()): CollectionState {
  const saved = readRecord(COLLECTION_KEY, isStored, store)
  if (saved)
    return { owned: saved.owned, packs: saved.packs, variants: saved.variants ?? NO_VARIANTS }
  let owned = starterCollection()
  for (const garage of loadGarages(store)) owned = grantGarage(owned, garage.cars, garage.deck)
  const state: CollectionState = { owned, packs: 0, variants: NO_VARIANTS }
  writeRecord(COLLECTION_KEY, state, store)
  return state
}

export function saveCollection(
  state: CollectionState,
  store: StorageLike | null = browserStorage(),
): boolean {
  return writeRecord(COLLECTION_KEY, state, store)
}

/** Adds packs to the stack and returns the new state. */
export function addPacks(
  count: number,
  store: StorageLike | null = browserStorage(),
): CollectionState {
  const current = loadCollection(store)
  const next = { ...current, packs: current.packs + count }
  saveCollection(next, store)
  return next
}

/** Opens the next pack with the seed, adds its cards, and saves. Null when the stack is empty. */
export function openNextPack(
  seed: number,
  store: StorageLike | null = browserStorage(),
): { state: CollectionState; pack: Pack } | null {
  const current = loadCollection(store)
  if (current.packs <= 0) return null
  const [pack] = openPack(seedRng(seed))
  const cards = packCards(pack)
  const state: CollectionState = {
    owned: grant(
      current.owned,
      cards.map((card) => card.id),
    ),
    packs: current.packs - 1,
    variants: grantVariants(current.variants, cards),
  }
  saveCollection(state, store)
  return { state, pack }
}
