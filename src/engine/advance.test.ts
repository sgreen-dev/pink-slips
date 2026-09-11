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

  // A weight reduction bigger than the car itself is a divide by zero without the floor the
  // code applies and DESIGN.md 3.3 now states.
  it('floors effective weight at 1 lb, so a huge reduction cannot divide by zero', () => {
    const car = getCar('mazda-mx-5-miata')
    const result = plain(car.id, { weightReductionLb: car.weightLb + 10_000 })
    expect(Number.isFinite(result.finalFt)).toBe(true)
    expect(result.finalFt).toBeGreaterThan(0)
    // Exactly the car's own weight leaves 1 lb, not 0.
    expect(Number.isFinite(plain(car.id, { weightReductionLb: car.weightLb }).finalFt)).toBe(true)
  })

  it('never goes below 0 feet', () => {
    // Wear can no longer take a car to nothing (see the wear floor below), so the floor at zero
    // is a Sabotage's to reach: one bigger than the whole advance leaves nothing, and no less.
    const swamped = plain('honda-civic-si', { sabotage: { flatReductionFt: 5000, halve: false } })
    expect(swamped.afterSabotageFt).toBe(0)
    expect(swamped.finalFt).toBe(0)
  })

  it('keeps wear math exact where floating point would round down', () => {
    // 1 - 0.1 × 8 is 0.19999999999999996 in floating point; 100 ft × that must still be 20.
    const car = { ...getCar('ford-mustang-gt'), hp: 100, weightLb: 3000 }
    const result = computeAdvance({ car, wear: 8, startFt: 0, isFirstAdvanceOfRace: false })
    expect(result.baseFt).toBe(100)
    expect(result.finalFt).toBe(20)
  })
})

/**
 * The per-type multipliers, written out rather than read from the tunable. Every other test
 * here computes its expectation from `TUNABLES.typeDistanceMultiplier`, which is tautological:
 * changing Luxury or Off-road would leave all of them green while quietly rebalancing two of
 * the six types (DESIGN.md 3.3 step 3).
 */
it('pins each type multiplier to the number DESIGN.md 3.3 states', () => {
  expect(TUNABLES.typeDistanceMultiplier).toEqual({
    sports: 1,
    luxury: 1.1,
    muscle: 1,
    jdm: 1.2,
    ev: 1,
    offroad: 1.2,
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

describe('the order of the steps (DESIGN.md 3.3, backlog Q49)', () => {
  // A Civic Si advances 243 ft plain, and every figure below starts from it.
  it('multiplies a Boost in after the flat bonuses and before the Sabotage', () => {
    // Redline and a Wheelspin's 100 ft: 243 x 1.5 is 364, less 100 is 264. The reduction taken
    // first would give (243 - 100) x 1.5, which is 214.
    const wheelspin = { flatReductionFt: 100, halve: false }
    expect(plain('honda-civic-si', { distancePercent: 0.5, sabotage: wheelspin }).finalFt).toBe(264)
    // A halving cuts the boosted number too: 364 / 2 is 182, where halving first gives 181.
    const halving = { flatReductionFt: 0, halve: true }
    expect(plain('honda-civic-si', { distancePercent: 0.5, sabotage: halving }).finalFt).toBe(182)
  })

  it("takes Overdrive's fraction after wear, not before it", () => {
    // 3 wear keeps 70%, so 243 becomes 170 and half of that is 85. Halving first gives 84.
    expect(plain('honda-civic-si', { wear: 3, finalMultiplier: 0.5 }).finalFt).toBe(85)
  })
})

describe('wear (DESIGN.md 3.3, backlog G18)', () => {
  it('slows a car to a tenth of its distance and no further, however much it carries', () => {
    const kept = (carId: string, wear: number) => plain(carId, { wear }).wearMultiplier
    expect(kept('honda-civic-si', 8)).toBeCloseTo(0.2)
    expect(kept('honda-civic-si', 9)).toBeCloseTo(0.1)
    expect(kept('honda-civic-si', 25)).toBeCloseTo(0.1)
    expect(plain('honda-civic-si', { wear: 25 }).finalFt).toBe(24)
    // Luxury wears at half the rate, so it reaches the floor at 18.
    expect(kept('lexus-lc-500', 17)).toBeCloseTo(0.15)
    expect(kept('lexus-lc-500', 40)).toBeCloseTo(0.1)
  })
})
