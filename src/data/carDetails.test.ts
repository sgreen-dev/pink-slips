import { describe, expect, it } from 'vitest'
import { CARS } from './cars.ts'
import { CAR_DETAILS, getCarDetail } from './carDetails.ts'

/**
 * The printed detail lives apart from the roster so it stays out of the first download
 * (backlog P3). Splitting a record is only safe while the two halves cannot drift, so this
 * pins that every car still has its detail and that every field of it is filled in — including
 * the source, which the repo's rules require every car's figures to name.
 */

describe('car details', () => {
  it('has an entry for every car in the roster, and none for anything else', () => {
    for (const car of CARS) {
      expect(CAR_DETAILS[car.id], `${car.id} has no detail record`).toBeDefined()
    }
    const ids = new Set(CARS.map((car) => car.id))
    const strays = Object.keys(CAR_DETAILS).filter((id) => !ids.has(id))
    expect(strays, 'detail records for cars that are not in the roster').toEqual([])
  })

  it('names a source, a drivetrain, an engine and the years for every car', () => {
    for (const car of CARS) {
      const detail = getCarDetail(car.id)
      expect(detail.source.trim().length, `${car.id} has no source`).toBeGreaterThan(0)
      expect(detail.drivetrain.trim().length, `${car.id} has no drivetrain`).toBeGreaterThan(0)
      expect(detail.engine.trim().length, `${car.id} has no engine`).toBeGreaterThan(0)
      expect(
        detail.productionYears.trim().length,
        `${car.id} has no production years`,
      ).toBeGreaterThan(0)
    }
  })

  it('refuses an id that is not a car', () => {
    expect(() => getCarDetail('not-a-car')).toThrow('Unknown car id')
  })
})
