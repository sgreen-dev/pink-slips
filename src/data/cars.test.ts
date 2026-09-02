import { describe, expect, it } from 'vitest'
import { CARS, getCar } from './cars.ts'
import { isJudgmentPlacement, powerToWeight, tierForRatio } from './tiers.ts'
import { CAR_TYPES, TIERS, type CarType, type Tier } from './types.ts'

/** The 30 cars marked ★ in DESIGN.md 2.4. Requested by name and fixed. */
const STARRED = [
  // Sports
  'porsche-911-carrera-s',
  'lotus-emira',
  'ferrari-f430',
  'ferrari-458-italia',
  'lamborghini-murcielago-lp640',
  'lamborghini-aventador-svj',
  'lamborghini-temerario',
  'mclaren-765lt',
  // Luxury
  'rolls-royce-wraith',
  'bmw-m5-competition',
  'mercedes-amg-gt-r',
  'aston-martin-dbs-superleggera',
  'ferrari-812-superfast',
  'ferrari-12cilindri',
  // Muscle
  'chevrolet-camaro-ss-1le',
  'ford-mustang-gt',
  'dodge-challenger-srt8',
  'plymouth-hemi-cuda',
  'chevrolet-corvette-z06-c6',
  'dodge-viper',
  // JDM
  'honda-civic-si',
  'acura-integra-type-r',
  'nissan-altima',
  'honda-s2000',
  'mazda-rx-7',
  'nissan-gt-r',
  // EV
  'toyota-prius',
  'tesla-model-s-plaid',
  // Off-road
  'ford-f-150-raptor',
  'subaru-wrx-sti',
]

/** Cells the design doc says have no real car (DESIGN.md 2.2). */
const EMPTY_CELLS: ReadonlyArray<readonly [CarType, Tier]> = [
  ['offroad', 'super'],
  ['offroad', 'hyper'],
  ['jdm', 'hyper'],
]

describe('cars', () => {
  it('has 52 cars', () => {
    expect(CARS).toHaveLength(52)
  })

  it('includes every starred car from the design doc', () => {
    expect(STARRED).toHaveLength(30)
    const missing = STARRED.filter((id) => !CARS.some((car) => car.id === id))
    expect(missing).toEqual([])
  })

  it('gives every car a tier that matches its band, or a tierNote for a judgment placement', () => {
    for (const car of CARS) {
      const ratio = powerToWeight(car.hp, car.weightLb)
      if (car.tier === tierForRatio(ratio)) {
        expect(car.tierNote, `${car.id} has a tierNote but sits inside its band`).toBeUndefined()
      } else {
        expect(car.tierNote, `${car.id} is outside its band with no tierNote`).toBeTruthy()
        expect(isJudgmentPlacement(ratio, car.tier), `${car.id} is too far from a boundary`).toBe(
          true,
        )
      }
    }
  })

  it('has positive published figures and a source for every car', () => {
    for (const car of CARS) {
      expect(car.hp, car.id).toBeGreaterThan(0)
      expect(car.weightLb, car.id).toBeGreaterThan(0)
      expect(Number.isInteger(car.hp), car.id).toBe(true)
      expect(Number.isInteger(car.weightLb), car.id).toBe(true)
      expect(car.zeroToSixtySec, car.id).toBeGreaterThan(0)
      expect(car.topSpeedMph, car.id).toBeGreaterThan(0)
      expect(car.source.trim().length, `${car.id} has no source`).toBeGreaterThan(0)
      expect(car.engine.trim().length, car.id).toBeGreaterThan(0)
      expect(car.productionYears.trim().length, car.id).toBeGreaterThan(0)
    }
  })

  it('leaves imageUrl empty in v1', () => {
    for (const car of CARS) {
      expect(car.imageUrl).toBe('')
    }
  })

  it('has a unique display name per car', () => {
    const names = CARS.map((car) => car.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('fills every cell of the grid except the ones the design doc leaves empty', () => {
    for (const type of CAR_TYPES) {
      for (const tier of TIERS) {
        const count = CARS.filter((car) => car.type === type && car.tier === tier).length
        const shouldBeEmpty = EMPTY_CELLS.some(([t, r]) => t === type && r === tier)
        if (shouldBeEmpty) {
          expect(count, `${type}/${tier} should be empty`).toBe(0)
        } else {
          expect(count, `${type}/${tier} has no car`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('looks cars up by id', () => {
    expect(getCar('honda-civic-si').make).toBe('Honda')
    expect(() => getCar('not-a-car')).toThrow()
  })
})
