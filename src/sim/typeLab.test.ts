import { describe, expect, it } from 'vitest'
import { CARS, getCar } from '../data/cars.ts'
import { sameTierGarages, type GarageSpec } from '../data/garages.ts'
import { CAR_TYPES, TIERS } from '../data/types.ts'
import { seedRng, TUNABLES } from '../engine/index.ts'
import { wilson } from './stats.ts'
import { checkTypeTargets, formatTypeLabReport, runTypeLab, typeWarnings } from './typeLab.ts'

/**
 * The type lab (DESIGN.md 7, backlog G20). What is held here is the method, never a verdict: a
 * small run fills every reading, the measured garage moves first in exactly half its games, a seed
 * plays the same games every time, one reading resized leaves the others alone, and the garages
 * with the tiers held equal really do hold the same tiers.
 */

const SMALL = { games: 12, tiered: 6, pro: 6, intro: 4, seed: 3 }

describe('the type lab', () => {
  it('fills every reading for every type', () => {
    const report = runTypeLab(SMALL)
    for (const type of CAR_TYPES) {
      expect(report.field.get(type)?.games).toBe(12)
      expect(report.sameTiers.get(type)?.games).toBe(6)
      expect(report.pro.get(type)?.games).toBe(6)
    }
    expect(report.intro.games).toBe(4)
  })

  it('has the measured garage move first in exactly half its games', () => {
    const report = runTypeLab(SMALL)
    for (const cells of [report.field, report.sameTiers, report.pro]) {
      for (const cell of cells.values()) expect(cell.firstGames * 2).toBe(cell.games)
    }
  })

  it('plays the same games for the same seed', () => {
    const text = () => formatTypeLabReport(runTypeLab(SMALL)).replace(/, [\d.]+ s/, '')
    expect(text()).toBe(text())
  })

  it('leaves the other readings alone when one is resized', () => {
    const all = runTypeLab(SMALL)
    const fewer = runTypeLab({ ...SMALL, tiered: 0, pro: 2 })
    expect(fewer.field).toEqual(all.field)
    expect(fewer.intro).toEqual(all.intro)
  })

  it('checks every type against the band', () => {
    const targets = checkTypeTargets(runTypeLab(SMALL))
    expect(targets).toHaveLength(CAR_TYPES.length)
    for (const target of targets) expect(target.name).toContain('between 45% and 55%')
  })

  it('warns about a Pro reading outside the band, and only when Pro played', () => {
    for (const warning of typeWarnings(runTypeLab(SMALL))) expect(warning).toContain('Pro CPU')
    expect(typeWarnings(runTypeLab({ ...SMALL, pro: 0 }))).toEqual([])
  })
})

describe('garages with the tiers held equal', () => {
  const shared = TIERS.filter((tier) =>
    CAR_TYPES.every((type) => CARS.some((car) => car.type === type && car.tier === tier)),
  )
  const tiersOf = (garage: GarageSpec) => garage.garage.map((id) => getCar(id).tier).sort()

  it('give both sides the same tiers, one side all of the type', () => {
    let rng = seedRng(11)
    for (const type of CAR_TYPES) {
      for (let i = 0; i < 40; i++) {
        let subject: GarageSpec
        let other: GarageSpec
        ;[subject, other, rng] = sameTierGarages(type, rng)
        expect(subject.garage.every((id) => getCar(id).type === type)).toBe(true)
        expect(tiersOf(subject)).toEqual(tiersOf(other))
        for (const tier of tiersOf(subject)) expect(shared).toContain(tier)
        for (const garage of [subject, other]) {
          expect(new Set(garage.garage).size).toBe(TUNABLES.garageSize)
          expect(garage.deck).toHaveLength(TUNABLES.modDeckSize)
        }
      }
    }
  })

  it('leave out a tier some type has no cars in', () => {
    expect(shared.length).toBeLessThan(TIERS.length)
  })
})

describe('the 95% range', () => {
  it('matches known values', () => {
    const [low, high] = wilson({ wins: 50, games: 100 })
    expect(low).toBeCloseTo(0.4038, 3)
    expect(high).toBeCloseTo(0.5962, 3)
    const [none, most] = wilson({ wins: 0, games: 10 })
    expect(none).toBe(0)
    expect(most).toBeCloseTo(0.2775, 3)
  })

  it('has nothing to say about no games', () => {
    expect(wilson({ wins: 0, games: 0 }).every(Number.isNaN)).toBe(true)
  })
})
