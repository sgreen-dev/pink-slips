import { seedRng, TUNABLES } from '../engine/index.ts'
import {
  isCollectionState,
  normalizeCollection,
  type CollectionState,
} from '../protocol/records.ts'
import {
  browserStorage,
  loadGarages,
  readRecord,
  saveGarages,
  writeRecord,
  type StorageLike,
} from '../browser/storage.ts'
import {
  GRANT_VERSION,
  NO_VARIANTS,
  buyCard,
  claimLap,
  garagesAfterLap,
  grant,
  grantGarage,
  grantVariants,
  introCollection,
  openPack,
  packCards,
  rebaseToIntro,
  scrapAll,
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
  credits?: number
}

/**
 * A stored record the loader can use: the checks the service puts a claimed record through, with
 * the one allowance an old browser needs, that a record written before phase 12 has no variants
 * (backlog S24). This kept its own looser copy of those checks, which let an array, a negative or
 * a fraction load as a count and never looked at credits, laps or the grant version, so a record
 * the comment below calls corrupt was loaded as a collection instead of replaced.
 */
function isStored(value: unknown): value is StoredState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return isCollectionState(
    record['variants'] === undefined ? { ...record, variants: NO_VARIANTS } : record,
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
    credits: 0,
  }
  writeRecord(COLLECTION_KEY, state, store)
  return state
}

/**
 * A change the browser made, and whether it managed to store it. A blocked or full store still
 * returns the new state, since the change is real for this page, but `saved` false means it will
 * not be there next time and the screen has to say so (DESIGN.md 12).
 */
export interface Written {
  state: CollectionState
  saved: boolean
}

export function saveCollection(
  state: CollectionState,
  store: StorageLike | null = browserStorage(),
): boolean {
  return writeRecord(COLLECTION_KEY, state, store)
}

/** Adds packs to the stack. */
export function addPacks(count: number, store: StorageLike | null = browserStorage()): Written {
  const current = loadCollection(store)
  const next = { ...current, packs: current.packs + count }
  return { state: next, saved: saveCollection(next, store) }
}

/** Opens the next pack with the seed, adds its cards, and saves. Null when the stack is empty. */
export function openNextPack(
  seed: number,
  store: StorageLike | null = browserStorage(),
): { state: CollectionState; pack: Pack; saved: boolean } | null {
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
    credits: current.credits,
  }
  return { state, pack, saved: saveCollection(state, store) }
}

/**
 * Takes the lap in the browser (DESIGN.md 12, Laps): the collection and the saved garages that
 * still build. Null when the collection is not complete or the keepsake is not owned.
 */
export function claimLapLocally(
  keepsakeId: string,
  store: StorageLike | null = browserStorage(),
): Written | null {
  const next = claimLap(loadCollection(store), keepsakeId)
  if (!next) return null
  // The lap rewrites the garages too, so both writes have to land for the lap to survive.
  const stored = saveCollection(next, store)
  const garages = saveGarages(garagesAfterLap(loadGarages(store), next.owned), store)
  return { state: next, saved: stored && garages }
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

/** Scraps the browser's surplus for credits. Null when there is nothing to scrap. */
export function scrapLocally(store: StorageLike | null = browserStorage()): Written | null {
  const next = scrapAll(loadCollection(store))
  if (!next) return null
  return { state: next, saved: saveCollection(next, store) }
}

/** Buys a card with the browser's credits. Null when it cannot be bought. */
export function buyLocally(
  id: string,
  store: StorageLike | null = browserStorage(),
): Written | null {
  const next = buyCard(loadCollection(store), id)
  if (!next) return null
  return { state: next, saved: saveCollection(next, store) }
}
