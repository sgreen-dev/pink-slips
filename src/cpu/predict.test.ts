import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { scenario } from '../engine/test-helpers.ts'
import type { CarState, MatchState } from '../engine/types.ts'
import {
  emptyEstimate,
  forcedHeads,
  fuelNeeded,
  partValue,
  readyAdvance,
  usefulFt,
  weakestPart,
} from './predict.ts'

/**
 * What the CPU thinks a card is worth. Three of these had tests through `cpu.test.ts` and the
 * rest had none, which is how the file that decides every CPU decision was mostly unchecked.
 */

const MIATA = 'mazda-mx-5-miata'
const LC500 = 'lexus-lc-500'
const LUXURY = 'lexus-is-300'

function carOf(state: MatchState, carId: string): CarState {
  const car = state.players[0].garage.find((c) => c.carId === carId)
  if (!car) throw new Error(`no ${carId} in the garage`)
  return car
}

const withCars = (cars: ReadonlyArray<string | { id: string; fuel?: number; parts?: string[] }>) =>
  scenario({ players: [{ cars }, { cars: ['porsche-911-carrera-s'] }] })

describe('what the CPU forecasts', () => {
  it('starts an estimate at nothing, so a card only ever adds', () => {
    const empty = emptyEstimate()
    expect(empty.hpPercent).toBe(0)
    expect(empty.weightReductionLb).toBe(0)
    expect(empty.flatBonuses).toEqual([])
    expect(empty.distancePercent).toBe(0)
    expect(empty.extraAdvanceMultiplier).toBeNull()
  })

  it('reads a standing-start advance, and Parts move it', () => {
    const bare = withCars([MIATA])
    const tuned = withCars([{ id: MIATA, parts: ['turbo-kit'] }])
    const plain = readyAdvance(carOf(bare, MIATA))
    expect(plain).toBeGreaterThan(0)
    expect(readyAdvance(carOf(tuned, MIATA))).toBeGreaterThan(plain)
  })

  it('counts the fuel a car still needs, never below zero', () => {
    const state = withCars([
      { id: LC500, fuel: 0 },
      { id: MIATA, fuel: 9 },
    ])
    expect(fuelNeeded(carOf(state, LC500))).toBeGreaterThan(0)
    // Fuel past the cost is not negative need.
    expect(fuelNeeded(carOf(state, MIATA))).toBe(0)
  })

  it('values a Part by what it adds, and finds the weakest one on a car', () => {
    const state = withCars([{ id: MIATA, parts: ['turbo-kit', 'weight-reduction'] }])
    const car = carOf(state, MIATA)
    expect(partValue(car, 'turbo-kit')).toBeGreaterThan(0)
    const weakest = weakestPart(car)
    expect(weakest === 'turbo-kit' || weakest === 'weight-reduction').toBe(true)
    // The weakest is the one worth least, by the same measure.
    const others = ['turbo-kit', 'weight-reduction'].filter((id) => id !== weakest)
    for (const other of others) {
      expect(partValue(car, weakest ?? '')).toBeLessThanOrEqual(partValue(car, other))
    }
    expect(weakestPart(carOf(withCars([MIATA]), MIATA))).toBeNull()
  })

  it('counts only the feet that reach the line, since the rest are wasted', () => {
    const track = TUNABLES.trackLengthFt
    const forecast = { canAdvance: true, ft: 500, toFt: 500, wins: false }
    expect(usefulFt(forecast, 0)).toBe(500)
    // Past the line, only the distance still to run counts.
    expect(usefulFt(forecast, track - 100)).toBe(100)
    expect(usefulFt(forecast, track)).toBe(0)
  })

  // The Sports identity forces the first flip of each race to heads (DESIGN.md 2.3), which is
  // the one case where the CPU's read-it-as-tails rule does not apply.
  it('knows when a coin flip is certain', () => {
    const sports = getCar(MIATA)
    expect(sports.type).toBe('sports')
    const first = withCars([MIATA])
    expect(forcedHeads(first, 0)).toBe(true)
    const flipped = { ...first, race: { ...first.race, coinFlips: [1, 0] as [number, number] } }
    expect(forcedHeads(flipped, 0)).toBe(false)
    // A car of any other type never forces one.
    expect(getCar(LUXURY).type).not.toBe('sports')
    expect(forcedHeads(withCars([LUXURY]), 0)).toBe(false)
  })
})
