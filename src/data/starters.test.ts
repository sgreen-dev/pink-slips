import { describe, expect, it } from 'vitest'
import { CAR_BY_ID } from './cars.ts'
import { MOD_BY_ID } from './mods.ts'
import { STARTERS } from './starters.ts'

const GARAGE_SIZE = 5
const DECK_SIZE = 30
const MAX_COPIES = 3

/** Car lists fixed by DESIGN.md 5. */
const DESIGN_GARAGES: Record<string, string[]> = {
  'street-kings': [
    'ford-mustang-gt',
    'chevrolet-camaro-ss-1le',
    'mazda-rx-7',
    'honda-s2000',
    'honda-civic-si',
  ],
  'exotic-garage': [
    'lamborghini-aventador-svj',
    'ferrari-458-italia',
    'mercedes-amg-gt-r',
    'porsche-911-carrera-s',
    'mazda-mx-5-miata',
  ],
  'electric-avenue': [
    'tesla-model-s-plaid',
    'hyundai-ioniq-5-n',
    'ford-f-150-raptor-r',
    'subaru-wrx-sti',
    'toyota-prius',
  ],
}

describe('starter garages', () => {
  it('ships exactly three starters', () => {
    expect(STARTERS.map((starter) => starter.id)).toEqual(Object.keys(DESIGN_GARAGES))
  })

  it.each(STARTERS)('$name has a garage of exactly 5 real cars', (starter) => {
    expect(starter.cars).toHaveLength(GARAGE_SIZE)
    expect(new Set(starter.cars).size).toBe(GARAGE_SIZE)
    for (const id of starter.cars) {
      expect(CAR_BY_ID.has(id), `unknown car ${id}`).toBe(true)
    }
    expect([...starter.cars].sort()).toEqual([...(DESIGN_GARAGES[starter.id] ?? [])].sort())
  })

  it.each(STARTERS)('$name has a deck of exactly 30 mods with no mod over 3 copies', (starter) => {
    expect(starter.deck).toHaveLength(DECK_SIZE)
    const copies = new Map<string, number>()
    for (const id of starter.deck) {
      expect(MOD_BY_ID.has(id), `unknown mod ${id}`).toBe(true)
      copies.set(id, (copies.get(id) ?? 0) + 1)
    }
    for (const [id, count] of copies) {
      expect(count, `${id} has ${count} copies`).toBeLessThanOrEqual(MAX_COPIES)
    }
  })

  it.each(STARTERS)('$name only runs type-locked mods it has a car for', (starter) => {
    const types = new Set(starter.cars.map((id) => CAR_BY_ID.get(id)?.type))
    for (const id of new Set(starter.deck)) {
      const mod = MOD_BY_ID.get(id)
      if (mod?.typeLock) {
        expect(types.has(mod.typeLock), `${id} needs a ${mod.typeLock} car`).toBe(true)
      }
    }
  })
})
