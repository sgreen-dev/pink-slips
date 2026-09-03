import { seedRng } from '../engine/index.ts'
import {
  browserStorage,
  loadGarages,
  readRecord,
  writeRecord,
  type StorageLike,
} from '../ui/storage.ts'
import {
  grant,
  grantGarage,
  openPack,
  packCards,
  starterCollection,
  type Collection,
  type Pack,
} from './collection.ts'

/** The collection in localStorage, next to the garages and through the same wrapper. */

export const COLLECTION_KEY = 'pink-slips.collection.v1'

export interface CollectionState {
  owned: Collection
  /** Packs earned and not yet opened. */
  packs: number
}

function isState(value: unknown): value is CollectionState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const owned = record['owned']
  return (
    typeof record['packs'] === 'number' &&
    typeof owned === 'object' &&
    owned !== null &&
    Object.values(owned as Record<string, unknown>).every((n) => typeof n === 'number')
  )
}

/**
 * Loads the collection. A browser without one starts with the starter cards plus every card in
 * a garage it saved before collections existed, so nothing built on v1 stops working. That
 * grant is written back at once and never repeats: from then on only packs add cards. A
 * corrupt record is replaced the same way.
 */
export function loadCollection(store: StorageLike | null = browserStorage()): CollectionState {
  const saved = readRecord(COLLECTION_KEY, isState, store)
  if (saved) return saved
  let owned = starterCollection()
  for (const garage of loadGarages(store)) owned = grantGarage(owned, garage.cars, garage.deck)
  const state: CollectionState = { owned, packs: 0 }
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
  const state = { owned: grant(current.owned, packCards(pack)), packs: current.packs - 1 }
  saveCollection(state, store)
  return { state, pack }
}
