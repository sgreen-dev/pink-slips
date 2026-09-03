import { copiesOwned, type Collection } from '../collection/collection.ts'
import { CAR_BY_ID, getCar } from '../data/cars.ts'
import { MOD_BY_ID, getMod } from '../data/mods.ts'
import { STARTERS } from '../data/starters.ts'
import type { ModFamily } from '../data/types.ts'
import { TUNABLES } from '../engine/index.ts'
import type { DraftRecord, SavedGarage } from './storage.ts'

/**
 * Rules and helpers for building a garage of 5 and a deck of 30 (DESIGN.md 3.1). Given a
 * collection, the builder also keeps to what the player owns (DESIGN.md 12); without one it
 * only checks the match rules, which is all racing a saved garage needs.
 */

export type GarageDraft = DraftRecord

export const FAMILY_LABEL: Readonly<Record<ModFamily, string>> = {
  part: 'Parts',
  boost: 'Boosts',
  sabotage: 'Sabotage',
}

export function emptyDraft(): GarageDraft {
  return { id: null, name: 'My garage', cars: [], deck: [] }
}

export function draftFrom(
  source: { name: string; cars: readonly string[]; deck: readonly string[] },
  id: string | null,
): GarageDraft {
  return { id, name: source.name, cars: [...source.cars], deck: [...source.deck] }
}

export function newGarageId(now = Date.now()): string {
  return `custom-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

export interface Validation {
  /** The garage cannot be saved or raced until these are fixed. */
  errors: string[]
  /** Worth knowing, but allowed. */
  warnings: string[]
}

export function deckCounts(deck: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}

/** Copies of a mod the deck may hold: the rule limit, or fewer if the player owns fewer. */
export function modCopyLimit(modId: string, owned?: Collection): number {
  const limit = TUNABLES.maxCopiesPerMod
  return owned ? Math.min(limit, copiesOwned(owned, modId)) : limit
}

export function validateDraft(draft: GarageDraft, owned?: Collection): Validation {
  const { garageSize, modDeckSize, maxCopiesPerMod } = TUNABLES
  const errors: string[] = []
  const warnings: string[] = []

  if (draft.name.trim().length === 0) errors.push('Give the garage a name.')

  const unknownCars = draft.cars.filter((id) => !CAR_BY_ID.has(id))
  if (unknownCars.length > 0) errors.push(`Unknown car: ${unknownCars.join(', ')}.`)
  if (new Set(draft.cars).size !== draft.cars.length)
    errors.push('Each car can be in the garage once.')
  if (draft.cars.length !== garageSize) {
    errors.push(`Garage has ${draft.cars.length} of ${garageSize} cars.`)
  }

  const unknownMods = draft.deck.filter((id) => !MOD_BY_ID.has(id))
  if (unknownMods.length > 0) errors.push(`Unknown mod: ${unknownMods.join(', ')}.`)
  if (draft.deck.length !== modDeckSize) {
    errors.push(`Deck has ${draft.deck.length} of ${modDeckSize} cards.`)
  }
  for (const [id, count] of deckCounts(draft.deck)) {
    if (count > maxCopiesPerMod && MOD_BY_ID.has(id)) {
      errors.push(`${getMod(id).name} has ${count} copies; the limit is ${maxCopiesPerMod}.`)
    }
  }

  if (owned) {
    for (const id of draft.cars) {
      if (CAR_BY_ID.has(id) && copiesOwned(owned, id) === 0) {
        errors.push(`You do not own the ${getCar(id).name} yet. Open packs to find it.`)
      }
    }
    for (const [id, count] of deckCounts(draft.deck)) {
      const have = copiesOwned(owned, id)
      if (MOD_BY_ID.has(id) && count > have) {
        errors.push(`${getMod(id).name}: the deck has ${count} but you own ${have}.`)
      }
    }
  }

  const types = new Set(draft.cars.filter((id) => CAR_BY_ID.has(id)).map((id) => getCar(id).type))
  for (const id of new Set(draft.deck)) {
    const mod = MOD_BY_ID.get(id)
    if (mod?.typeLock && !types.has(mod.typeLock)) {
      warnings.push(`${mod.name} needs a ${mod.typeLock.toUpperCase()} car to be playable.`)
    }
  }

  return { errors, warnings }
}

export function canAddCar(draft: GarageDraft, carId: string, owned?: Collection): boolean {
  return (
    draft.cars.length < TUNABLES.garageSize &&
    !draft.cars.includes(carId) &&
    (!owned || copiesOwned(owned, carId) > 0)
  )
}

export function addCar(draft: GarageDraft, carId: string, owned?: Collection): GarageDraft {
  return canAddCar(draft, carId, owned) ? { ...draft, cars: [...draft.cars, carId] } : draft
}

export function removeCar(draft: GarageDraft, carId: string): GarageDraft {
  return { ...draft, cars: draft.cars.filter((id) => id !== carId) }
}

export function canAddMod(draft: GarageDraft, modId: string, owned?: Collection): boolean {
  return (
    draft.deck.length < TUNABLES.modDeckSize &&
    (deckCounts(draft.deck).get(modId) ?? 0) < modCopyLimit(modId, owned)
  )
}

export function addMod(draft: GarageDraft, modId: string, owned?: Collection): GarageDraft {
  return canAddMod(draft, modId, owned) ? { ...draft, deck: [...draft.deck, modId] } : draft
}

/** Removes one copy. */
export function removeMod(draft: GarageDraft, modId: string): GarageDraft {
  const index = draft.deck.lastIndexOf(modId)
  if (index === -1) return draft
  return { ...draft, deck: [...draft.deck.slice(0, index), ...draft.deck.slice(index + 1)] }
}

/** A garage a player can pick at match start: a starter or a saved custom garage. */
export interface GarageOption {
  id: string
  name: string
  style: string
  cars: readonly string[]
  deck: readonly string[]
  custom: boolean
}

export function garageOptions(saved: readonly SavedGarage[]): GarageOption[] {
  const starters = STARTERS.map((s) => ({
    id: s.id,
    name: s.name,
    style: s.style,
    cars: s.cars,
    deck: s.deck,
    custom: false,
  }))
  const custom = [...saved]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter(
      (g) =>
        validateDraft({ id: g.id, name: g.name, cars: g.cars, deck: g.deck }).errors.length === 0,
    )
    .map((g) => ({
      id: g.id,
      name: g.name,
      style: 'custom garage',
      cars: g.cars,
      deck: g.deck,
      custom: true,
    }))
  return [...starters, ...custom]
}
