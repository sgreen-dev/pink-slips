/**
 * Custom garages persist in localStorage. Every call is wrapped so a blocked, full, or missing
 * store never throws into the UI; readers get an empty list and writers get false.
 */

export interface SavedGarage {
  id: string
  name: string
  cars: readonly string[]
  deck: readonly string[]
  /** Milliseconds since the epoch. */
  updatedAt: number
}

/** The subset of the Storage interface the app uses, so tests can pass a fake. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const GARAGES_KEY = 'pink-slips.garages.v1'
export const DRAFT_KEY = 'pink-slips.draft.v1'

function browserStorage(): StorageLike | null {
  try {
    const store = (globalThis as { localStorage?: StorageLike }).localStorage
    return store ?? null
  } catch {
    return null
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isSavedGarage(value: unknown): value is SavedGarage {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record['id'] === 'string' &&
    typeof record['name'] === 'string' &&
    isStringArray(record['cars']) &&
    isStringArray(record['deck']) &&
    typeof record['updatedAt'] === 'number'
  )
}

function read<T>(
  key: string,
  check: (value: unknown) => value is T,
  store: StorageLike | null,
): T | null {
  try {
    const raw = store?.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return check(parsed) ? parsed : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown, store: StorageLike | null): boolean {
  try {
    if (!store) return false
    store.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadGarages(store: StorageLike | null = browserStorage()): SavedGarage[] {
  const list = read(GARAGES_KEY, (v): v is unknown[] => Array.isArray(v), store)
  return (list ?? []).filter(isSavedGarage)
}

export function saveGarages(
  garages: readonly SavedGarage[],
  store: StorageLike | null = browserStorage(),
): boolean {
  return write(GARAGES_KEY, garages, store)
}

/** Adds the garage or replaces the one with the same id. */
export function upsertGarage(
  garage: SavedGarage,
  store: StorageLike | null = browserStorage(),
): boolean {
  const others = loadGarages(store).filter((g) => g.id !== garage.id)
  return saveGarages([...others, garage], store)
}

export function deleteGarage(id: string, store: StorageLike | null = browserStorage()): boolean {
  return saveGarages(
    loadGarages(store).filter((g) => g.id !== id),
    store,
  )
}

/** The garage being built, kept across refreshes. Any shape the builder can hold. */
export interface DraftRecord {
  id: string | null
  name: string
  cars: readonly string[]
  deck: readonly string[]
}

function isDraft(value: unknown): value is DraftRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    (record['id'] === null || typeof record['id'] === 'string') &&
    typeof record['name'] === 'string' &&
    isStringArray(record['cars']) &&
    isStringArray(record['deck'])
  )
}

export function loadDraft(store: StorageLike | null = browserStorage()): DraftRecord | null {
  return read(DRAFT_KEY, isDraft, store)
}

export function saveDraft(
  draft: DraftRecord,
  store: StorageLike | null = browserStorage(),
): boolean {
  return write(DRAFT_KEY, draft, store)
}

export function clearDraft(store: StorageLike | null = browserStorage()): void {
  try {
    store?.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to do: a store that cannot be cleared holds nothing worth keeping.
  }
}
