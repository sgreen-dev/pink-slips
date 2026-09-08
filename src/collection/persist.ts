import { seedRng, TUNABLES } from '../engine/index.ts'
import { normalizeCollection, type CollectionState } from '../protocol/records.ts'
import {
  browserStorage,
  loadGarages,
  readRecord,
  saveGarages,
  writeRecord,
  type StorageLike,
} from '../ui/storage.ts'
import {
  GRANT_VERSION,
  NO_VARIANTS,
  claimLap,
  garagesAfterLap,
  grant,
  grantGarage,
  grantVariants,
  introCollection,
  openPack,
  packCards,
  rebaseToIntro,
  type Collection,
  type Pack,
} from './collection.ts'

/** The collection in localStorage, next to the garages and through the same wrapper. */

export const COLLECTION_KEY = 'pink-slips.collection.v1'

/** Set when a record is rebased onto the intro set, so the collection screen can say so once. */
export const REBASE_NOTICE_KEY = 'pink-slips.rebase.v1'

export type { CollectionState }

/** What sits in storage. Records written before phase 12 have no variants. */
interface StoredState {
  owned: Collection
  packs: number
  variants?: { foil: Collection; holo: Collection; chrome?: Collection }
  laps?: number
  grantVersion?: number
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
 * Loads the collection. A browser without one starts with the intro set plus every card in a
 * garage it saved before collections existed, so nothing built on v1 stops working. That grant
 * is written back at once and never repeats: from then on only packs add cards. A corrupt
 * record is replaced the same way. A record written against the legacy loaner-garage grant is
 * rebased onto the intro set once, and the new version is written back so it never repeats.
 */
export function loadCollection(store: StorageLike | null = browserStorage()): CollectionState {
  const saved = readRecord(COLLECTION_KEY, isStored, store)
  if (saved) {
    const state = normalizeCollection({ ...saved, variants: saved.variants ?? NO_VARIANTS })
    if (state.grantVersion >= GRANT_VERSION) return state
    const rebased: CollectionState = {
      ...state,
      owned: rebaseToIntro(state.owned),
      grantVersion: GRANT_VERSION,
    }
    writeRecord(COLLECTION_KEY, rebased, store)
    writeRecord(REBASE_NOTICE_KEY, true, store)
    return rebased
  }
  let owned = introCollection()
  for (const garage of loadGarages(store)) owned = grantGarage(owned, garage.cars, garage.deck)
  const state: CollectionState = {
    owned,
    packs: 0,
    variants: NO_VARIANTS,
    laps: 0,
    grantVersion: GRANT_VERSION,
  }
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
  const [pack] = openPack(seedRng(seed), TUNABLES, current.laps)
  const cards = packCards(pack)
  const state: CollectionState = {
    owned: grant(
      current.owned,
      cards.map((card) => card.id),
    ),
    packs: current.packs - 1,
    variants: grantVariants(current.variants, cards),
    laps: current.laps,
    grantVersion: current.grantVersion,
  }
  saveCollection(state, store)
  return { state, pack }
}

/**
 * Takes the lap in the browser (DESIGN.md 12, Laps): the collection and the saved garages that
 * still build. Null when the collection is not complete or the keepsake is not owned.
 */
export function claimLapLocally(
  keepsakeId: string,
  store: StorageLike | null = browserStorage(),
): CollectionState | null {
  const next = claimLap(loadCollection(store), keepsakeId)
  if (!next) return null
  saveCollection(next, store)
  saveGarages(garagesAfterLap(loadGarages(store), next.owned), store)
  return next
}

/** True while the collection screen still owes the player the rebase notice. */
export function rebaseNoticePending(store: StorageLike | null = browserStorage()): boolean {
  return readRecord(REBASE_NOTICE_KEY, (v): v is boolean => v === true, store) === true
}

export function clearRebaseNotice(store: StorageLike | null = browserStorage()): void {
  try {
    store?.removeItem(REBASE_NOTICE_KEY)
  } catch {
    // Nothing to do: a store that cannot be cleared shows the notice again at worst.
  }
}
