import { describe, expect, it } from 'vitest'
import { CAR_BY_ID } from './cars.ts'
import { MOD_BY_ID } from './mods.ts'
import { INTRO_SET, STARTERS } from './starters.ts'

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

describe('loaner garages', () => {
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

describe('intro set', () => {
  const modIds = INTRO_SET.mods.map(([id]) => id)
  const copies = INTRO_SET.mods.reduce((sum, [, n]) => sum + n, 0)
  const loanerCars = new Set(STARTERS.flatMap((starter) => starter.cars))

  it('holds only real cars, each a loaner car so stakes already exempt them', () => {
    expect(new Set(INTRO_SET.cars).size).toBe(INTRO_SET.cars.length)
    for (const id of INTRO_SET.cars) {
      expect(CAR_BY_ID.has(id), `unknown car ${id}`).toBe(true)
      expect(loanerCars.has(id), `${id} is not a loaner car`).toBe(true)
    }
  })

  it('caps the free cars at Performance, so every Super and Hyper is opened', () => {
    for (const id of INTRO_SET.cars) {
      const tier = CAR_BY_ID.get(id)?.tier
      expect(tier === 'daily' || tier === 'performance', `${id} is ${tier}`).toBe(true)
    }
  })

  it('always builds a legal garage and deck', () => {
    expect(INTRO_SET.cars.length).toBeGreaterThanOrEqual(GARAGE_SIZE)
    expect(copies).toBeGreaterThanOrEqual(DECK_SIZE)
  })

  it('holds only real mods, none at the deck cap, so no pack slot starts dead', () => {
    expect(new Set(modIds).size).toBe(modIds.length)
    for (const [id, n] of INTRO_SET.mods) {
      expect(MOD_BY_ID.has(id), `unknown mod ${id}`).toBe(true)
      expect(n, `${id} has ${n} copies`).toBeLessThan(MAX_COPIES)
    }
  })

  it('covers all four mod families, so every kind of play is taught', () => {
    const families = new Set(
      modIds.map((id) => {
        const mod = MOD_BY_ID.get(id)
        return mod?.family === 'sabotage' ? `sabotage:${mod.kind}` : mod?.family
      }),
    )
    expect([...families].sort()).toEqual(['boost', 'part', 'sabotage:pit', 'sabotage:traction'])
  })

  it('grants no rare mod and no type-locked mod, leaving both to be found', () => {
    for (const id of modIds) {
      const mod = MOD_BY_ID.get(id)
      expect(mod?.typeLock, `${id} is type-locked`).toBeUndefined()
      expect(mod?.rarity, `${id} is rare`).not.toBe('rare')
    }
  })

  it('gives every held-back type lock a car to land on, so a find is never dead', () => {
    const types = new Set(INTRO_SET.cars.map((id) => CAR_BY_ID.get(id)?.type))
    for (const mod of MOD_BY_ID.values()) {
      if (mod.typeLock) expect(types.has(mod.typeLock), `${mod.id} has no home`).toBe(true)
    }
  })
})
