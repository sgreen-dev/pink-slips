import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { computeAdvance } from './advance.ts'
import { TUNABLES } from './tunables.ts'

const plain = (carId: string, overrides: Partial<Parameters<typeof computeAdvance>[0]> = {}) =>
  computeAdvance({
    car: getCar(carId),
    wear: 0,
    startFt: 0,
    isFirstAdvanceOfRace: false,
    ...overrides,
  })

describe('advance formula (DESIGN.md 3.3)', () => {
  it('matches the worked example at K = 3000 with no mods', () => {
    const examples: Array<[string, number, number]> = [
      ['honda-civic-si', 243, 6],
      ['ford-mustang-gt', 372, 4],
      ['lamborghini-aventador-svj', 677, 2],
      ['rimac-nevera', 1132, 2],
    ]
    expect(TUNABLES.advanceK).toBe(3000)
    for (const [carId, feet, advancesNeeded] of examples) {
      const result = plain(carId)
      expect(result.baseFt, carId).toBe(feet)
      expect(result.finalFt, carId).toBe(feet)
      expect(Math.ceil(TUNABLES.trackLengthFt / result.finalFt), carId).toBe(advancesNeeded)
    }
  })

  it('step 3 floors K × hp × type multiplier ÷ weight to whole feet', () => {
    const car = getCar('honda-civic-si')
    const exact =
      (TUNABLES.advanceK * car.hp * TUNABLES.typeDistanceMultiplier[car.type]) / car.weightLb
    expect(Number.isInteger(exact)).toBe(false)
    expect(plain(car.id).baseFt).toBe(Math.floor(exact))
  })

  it('steps 1 and 2 apply hp percent and weight reduction before the base', () => {
    const car = getCar('ford-mustang-gt')
    const result = plain(car.id, { hpPercent: 0.2, weightReductionLb: 300 })
    expect(result.effectiveHp).toBeCloseTo(car.hp * 1.2)
    expect(result.effectiveWeightLb).toBe(car.weightLb - 300)
    expect(result.baseFt).toBe(
      Math.floor((TUNABLES.advanceK * car.hp * 1.2) / (car.weightLb - 300)),
    )
  })

  it('step 4 adds flat bonuses after the base', () => {
    const base = plain('honda-civic-si').baseFt
    expect(plain('honda-civic-si', { flatBonusFt: 100 }).finalFt).toBe(base + 100)
  })

  it('step 5 applies flat sabotage reductions before halving', () => {
    const base = plain('honda-civic-si').baseFt
    const result = plain('honda-civic-si', { sabotage: { flatReductionFt: 100, halve: true } })
    expect(result.afterSabotageFt).toBe(Math.floor((base - 100) / 2))
    expect(result.finalFt).toBe(result.afterSabotageFt)
  })

  it('step 6 cuts the advance by the wear rate per wear point', () => {
    const base = plain('honda-civic-si').baseFt
    expect(plain('honda-civic-si', { wear: 1 }).finalFt).toBe(
      Math.floor(base * (1 - TUNABLES.wearRate)),
    )
    expect(plain('honda-civic-si', { wear: 3 }).finalFt).toBe(
      Math.floor(base * (1 - 3 * TUNABLES.wearRate)),
    )
  })

  it('step 6 uses half the wear rate for Luxury', () => {
    const car = getCar('lexus-lc-500')
    expect(car.type).toBe('luxury')
    const base = plain(car.id).baseFt
    const result = plain(car.id, { wear: 2 })
    expect(result.wearMultiplier).toBeCloseTo(
      1 - 2 * TUNABLES.wearRate * TUNABLES.typeIdentity.luxuryWearMultiplier,
    )
    expect(result.finalFt).toBe(Math.floor(base * result.wearMultiplier))
  })

  it('never goes below 0 feet', () => {
    expect(plain('honda-civic-si', { wear: 50 }).finalFt).toBe(0)
    expect(
      plain('honda-civic-si', { sabotage: { flatReductionFt: 5000, halve: false } }).finalFt,
    ).toBe(0)
  })

  it('keeps wear math exact where floating point would round down', () => {
    // 1 - 0.1 × 8 is 0.19999999999999996 in floating point; 100 ft × that must still be 20.
    const car = { ...getCar('ford-mustang-gt'), hp: 100, weightLb: 3000 }
    const result = computeAdvance({ car, wear: 8, startFt: 0, isFirstAdvanceOfRace: false })
    expect(result.baseFt).toBe(100)
    expect(result.finalFt).toBe(20)
  })
})

describe('type identities in the formula (DESIGN.md 2.3)', () => {
  it('EV adds the launch bonus on the first advance of a race only', () => {
    const car = getCar('tesla-model-s-plaid')
    expect(car.type).toBe('ev')
    const base = plain(car.id).baseFt
    const first = plain(car.id, { isFirstAdvanceOfRace: true })
    expect(first.typeBonusFt).toBe(TUNABLES.typeIdentity.evFirstAdvanceFt)
    expect(first.finalFt).toBe(base + TUNABLES.typeIdentity.evFirstAdvanceFt)
    expect(plain(car.id, { isFirstAdvanceOfRace: false }).typeBonusFt).toBe(0)
  })

  it('Muscle adds the top-end bonus on advances that start at or past the threshold', () => {
    const car = getCar('ford-mustang-gt')
    expect(car.type).toBe('muscle')
    const from = TUNABLES.typeIdentity.muscleTopEndFromFt
    expect(plain(car.id, { startFt: from - 1 }).typeBonusFt).toBe(0)
    expect(plain(car.id, { startFt: from }).typeBonusFt).toBe(TUNABLES.typeIdentity.muscleTopEndFt)
    expect(plain(car.id, { startFt: from + 200 }).typeBonusFt).toBe(
      TUNABLES.typeIdentity.muscleTopEndFt,
    )
  })

  it('gives no flat bonus to the other types', () => {
    for (const id of [
      'honda-civic-si',
      'porsche-911-carrera-s',
      'lexus-lc-500',
      'subaru-wrx-sti',
    ]) {
      expect(plain(id, { isFirstAdvanceOfRace: true, startFt: 700 }).typeBonusFt, id).toBe(0)
    }
  })
})
