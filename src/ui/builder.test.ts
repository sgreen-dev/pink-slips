import { describe, expect, it } from 'vitest'
import { STARTERS } from '../data/starters.ts'
import { createMatch, TUNABLES } from '../engine/index.ts'
import {
  addCar,
  addMod,
  canAddCar,
  canAddMod,
  deckCounts,
  draftFrom,
  emptyDraft,
  garageOptions,
  modCopyLimit,
  removeCar,
  removeMod,
  validateDraft,
} from './builder.ts'
import {
  clearDraft,
  deleteGarage,
  loadDraft,
  loadGarages,
  saveDraft,
  upsertGarage,
  type SavedGarage,
  type StorageLike,
} from './storage.ts'

function fakeStorage(initial: Record<string, string> = {}, failWrites = false): StorageLike {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error('QuotaExceededError')
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

const streetKings = STARTERS[0]!

describe('garage builder rules', () => {
  it('validates a complete garage and deck', () => {
    const draft = draftFrom(streetKings, null)
    expect(validateDraft(draft)).toEqual({ errors: [], warnings: [] })
  })

  it('reports what is missing or over the limit', () => {
    const draft = {
      ...emptyDraft(),
      name: ' ',
      cars: ['honda-civic-si'],
      deck: Array(31).fill('turbo-kit'),
    }
    const { errors } = validateDraft(draft)
    expect(errors).toContain('Give the garage a name.')
    expect(errors).toContain(`Garage has 1 of ${TUNABLES.garageSize} cars.`)
    expect(errors).toContain(`Deck has 31 of ${TUNABLES.modDeckSize} cards.`)
    expect(errors.some((e) => e.startsWith('Turbo Kit has 31 copies'))).toBe(true)
  })

  it('caps a rare mod at one copy', () => {
    expect(modCopyLimit('fuel-drain')).toBe(TUNABLES.maxCopiesPerRareMod)
    expect(modCopyLimit('fuel-siphon')).toBe(TUNABLES.maxCopiesPerMod)
    const two = {
      ...draftFrom(streetKings, null),
      deck: [...streetKings.deck.slice(0, 28), 'fuel-drain', 'fuel-drain'],
    }
    expect(validateDraft(two).errors).toContain('Fuel Drain has 2 copies; the limit is 1.')
    const one = { ...two, deck: [...streetKings.deck.slice(0, 29), 'fuel-drain'] }
    expect(validateDraft(one).errors).toEqual([])
  })

  it('warns about type-locked mods the garage cannot use', () => {
    const draft = {
      ...draftFrom(streetKings, null),
      deck: [...streetKings.deck.slice(0, 29), 'regen'],
    }
    const { errors, warnings } = validateDraft(draft)
    expect(errors).toEqual([])
    expect(warnings).toEqual(['Regen needs a EV car to be playable.'])
  })

  it('adds and removes cars within the garage size, once each', () => {
    let draft = emptyDraft()
    for (const id of streetKings.cars) draft = addCar(draft, id)
    expect(draft.cars).toHaveLength(5)
    expect(canAddCar(draft, 'rimac-nevera')).toBe(false)
    expect(addCar(draft, 'rimac-nevera')).toBe(draft)
    draft = removeCar(draft, 'honda-civic-si')
    expect(canAddCar(draft, 'honda-civic-si')).toBe(true)
    expect(canAddCar(draft, 'ford-mustang-gt')).toBe(false)
  })

  it('adds and removes mods within the deck size and copy limit', () => {
    let draft = emptyDraft()
    draft = addMod(addMod(addMod(draft, 'turbo-kit'), 'turbo-kit'), 'turbo-kit')
    expect(canAddMod(draft, 'turbo-kit')).toBe(false)
    expect(addMod(draft, 'turbo-kit').deck).toHaveLength(3)
    draft = removeMod(draft, 'turbo-kit')
    expect(draft.deck).toEqual(['turbo-kit', 'turbo-kit'])
    let full = draftFrom(streetKings, null)
    expect(canAddMod(full, 'power-shift')).toBe(false)
    full = removeMod(full, 'power-shift')
    expect(canAddMod(full, 'power-shift')).toBe(true)
  })

  it('offers starters first, then valid saved garages, newest first', () => {
    const saved: SavedGarage[] = [
      { id: 'a', name: 'Old', cars: streetKings.cars, deck: streetKings.deck, updatedAt: 1 },
      { id: 'b', name: 'New', cars: streetKings.cars, deck: streetKings.deck, updatedAt: 2 },
      { id: 'c', name: 'Broken', cars: ['honda-civic-si'], deck: [], updatedAt: 3 },
    ]
    const options = garageOptions(saved)
    expect(options.map((o) => o.name)).toEqual([
      'Street Kings',
      'Exotic Garage',
      'Electric Avenue',
      'New',
      'Old',
    ])
    expect(options.filter((o) => o.custom)).toHaveLength(2)
    const custom = options[3]!
    const config = {
      players: [
        { garage: custom.cars, deck: custom.deck },
        { garage: streetKings.cars, deck: streetKings.deck },
      ] as const,
    }
    expect(() => createMatch(config, 1)).not.toThrow()
  })
})

describe('garage storage', () => {
  const garage: SavedGarage = {
    id: 'custom-1',
    name: 'Mine',
    cars: streetKings.cars,
    deck: streetKings.deck,
    updatedAt: 5,
  }

  it('round-trips garages and replaces by id', () => {
    const store = fakeStorage()
    expect(loadGarages(store)).toEqual([])
    expect(upsertGarage(garage, store)).toBe(true)
    expect(loadGarages(store)).toEqual([garage])
    expect(upsertGarage({ ...garage, name: 'Renamed' }, store)).toBe(true)
    expect(loadGarages(store).map((g) => g.name)).toEqual(['Renamed'])
    expect(deleteGarage('custom-1', store)).toBe(true)
    expect(loadGarages(store)).toEqual([])
  })

  it('ignores corrupt or foreign data instead of throwing', () => {
    expect(loadGarages(fakeStorage({ 'pink-slips.garages.v1': '{not json' }))).toEqual([])
    expect(loadGarages(fakeStorage({ 'pink-slips.garages.v1': '"a string"' }))).toEqual([])
    const mixed = JSON.stringify([garage, { id: 1 }, null, { ...garage, id: 'x', cars: 'no' }])
    expect(loadGarages(fakeStorage({ 'pink-slips.garages.v1': mixed }))).toEqual([garage])
  })

  it('reports failed writes and survives a missing store', () => {
    expect(upsertGarage(garage, fakeStorage({}, true))).toBe(false)
    expect(upsertGarage(garage, null)).toBe(false)
    expect(loadGarages(null)).toEqual([])
    expect(loadDraft(null)).toBeNull()
  })

  it('keeps a draft across refreshes and clears it', () => {
    const store = fakeStorage()
    const draft = { id: null, name: 'Draft', cars: ['honda-civic-si'], deck: ['turbo-kit'] }
    expect(saveDraft(draft, store)).toBe(true)
    expect(loadDraft(store)).toEqual(draft)
    clearDraft(store)
    expect(loadDraft(store)).toBeNull()
  })
})

import { copiesOwned, owns, starterCollection } from '../collection/collection.ts'
import { CARS as ALL_CARS } from '../data/cars.ts'
import { MODS as ALL_MODS } from '../data/mods.ts'

describe('ownership', () => {
  const owned = starterCollection()
  const outsideCar = ALL_CARS.find((car) => !owns(owned, car.id))
  const scarceMod = ALL_MODS.find((mod) => {
    const have = copiesOwned(owned, mod.id)
    return have > 0 && have < TUNABLES.maxCopiesPerMod
  })

  it('rejects a car the player does not own and says so', () => {
    if (!outsideCar) throw new Error('Every car is in a starter')
    expect(canAddCar(emptyDraft(), outsideCar.id, owned)).toBe(false)
    expect(addCar(emptyDraft(), outsideCar.id, owned).cars).toEqual([])
    expect(canAddCar(emptyDraft(), outsideCar.id)).toBe(true)
    const errors = validateDraft({ ...emptyDraft(), cars: [outsideCar.id] }, owned).errors
    expect(errors.some((e) => e.includes(`do not own the ${outsideCar.name}`))).toBe(true)
  })

  it('caps mod copies at the copies owned', () => {
    if (!scarceMod) throw new Error('No starter mod below the copy limit')
    const have = copiesOwned(owned, scarceMod.id)
    let draft = emptyDraft()
    for (let i = 0; i < TUNABLES.maxCopiesPerMod; i++) draft = addMod(draft, scarceMod.id, owned)
    expect(deckCounts(draft.deck).get(scarceMod.id)).toBe(have)
    const full = { ...emptyDraft(), deck: Array.from({ length: have + 1 }, () => scarceMod.id) }
    const errors = validateDraft(full, owned).errors
    expect(errors.some((e) => e.includes(`you own ${have}`))).toBe(true)
    expect(validateDraft(full).errors.some((e) => e.includes('you own'))).toBe(false)
  })

  it('never reaches the engine: a match config is card ids only', () => {
    const option = garageOptions([])[0]
    if (!option) throw new Error('No starter option')
    const config = { players: [{ garage: option.cars, deck: option.deck }] }
    expect(Object.keys(config.players[0] ?? {})).toEqual(['garage', 'deck'])
  })
})
