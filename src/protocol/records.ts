import type { Collection, VariantCounts } from '../collection/collection.ts'

/**
 * Records that travel between the browser and the account service (DESIGN.md 13): a saved
 * garage and the collection state. Both sides check them with the guards here before use.
 */

export interface SavedGarage {
  id: string
  name: string
  cars: readonly string[]
  deck: readonly string[]
  /** Milliseconds since the epoch. */
  updatedAt: number
}

export interface CollectionState {
  owned: Collection
  /** Packs earned and not yet opened. */
  packs: number
  /** Foil and holo copies among the owned ones. */
  variants: VariantCounts
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isSavedGarage(value: unknown): value is SavedGarage {
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

export function isGarageList(value: unknown): value is SavedGarage[] {
  return Array.isArray(value) && value.every(isSavedGarage)
}

export function isCounts(value: unknown): value is Collection {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).every(
      (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0,
    )
  )
}

export function isCollectionState(value: unknown): value is CollectionState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const variants = record['variants'] as Record<string, unknown> | undefined
  return (
    typeof record['packs'] === 'number' &&
    Number.isInteger(record['packs']) &&
    record['packs'] >= 0 &&
    isCounts(record['owned']) &&
    variants !== undefined &&
    isCounts(variants['foil']) &&
    isCounts(variants['holo'])
  )
}
