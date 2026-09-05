import { describe, expect, it } from 'vitest'
import { CARS, getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { computeAdvance } from '../engine/index.ts'
import { carDetailRows, modDetailRows, stockAdvanceFt, type DetailRow } from './detail.ts'

const MUSTANG = 'ford-mustang-gt'

function value(rows: DetailRow[], label: string): string | undefined {
  return rows.find((row) => row.label === label)?.value
}

describe('car detail', () => {
  it('lists the published figures and ends with their source', () => {
    const rows = carDetailRows(MUSTANG)
    const car = getCar(MUSTANG)
    expect(value(rows, 'Horsepower')).toBe('460 hp')
    expect(value(rows, 'Weight')).toBe('3,705 lb')
    expect(value(rows, 'Power to weight')).toBe('0.124 hp per lb')
    expect(value(rows, 'Engine')).toBe(car.engine)
    expect(value(rows, 'Built')).toBe(car.productionYears)
    expect(value(rows, 'Source')).toBe(car.source)
    expect(rows.at(-1)?.label).toBe('Source')
  })

  it('computes the stock advance the engine would give', () => {
    const engine = computeAdvance({
      car: getCar(MUSTANG),
      wear: 0,
      startFt: 0,
      isFirstAdvanceOfRace: false,
    })
    expect(stockAdvanceFt(MUSTANG)).toBe(engine.finalFt)
    expect(value(carDetailRows(MUSTANG), 'Advance per turn')).toMatch(/^\d[\d,]* ft stock/)
  })

  it('names the type identity and what the tier needs', () => {
    const rows = carDetailRows(MUSTANG)
    expect(value(rows, 'Type')).toMatch(/^Muscle: moves 75 feet extra/)
    expect(value(rows, 'Tier')).toBe('Uncommon: needs 2 fuel to advance, 2 Part slots')
    expect(value(carDetailRows('honda-civic-si'), 'Tier')).toMatch(/3 Part slots$/)
  })

  it('shows a tier note only when the car has one', () => {
    const noted = CARS.find((car) => car.tierNote)
    expect(noted).toBeDefined()
    if (!noted) return
    expect(value(carDetailRows(noted.id), 'Tier note')).toBe(noted.tierNote)
    expect(value(carDetailRows(MUSTANG), 'Tier note')).toBeUndefined()
  })
})

describe('mod detail', () => {
  it('carries the rules text and how the family plays', () => {
    const rows = modDetailRows('wheelspin')
    expect(value(rows, 'Family')).toBe('Sabotage, Traction')
    expect(value(rows, 'Rules text')).toBe(getMod('wheelspin').text)
    expect(value(rows, 'How it plays')).toMatch(/^A Traction sabotage/)
    expect(value(modDetailRows('turbo-kit'), 'How it plays')).toMatch(
      /2 slots on a car, 3 on a JDM car/,
    )
  })

  it('marks rarity, level, lock, and cost', () => {
    const drain = modDetailRows('fuel-drain')
    expect(value(drain, 'Rarity')).toBe('Rare: at most 1 per deck, 5% of pack mod slots')
    expect(value(drain, 'Level')).toBe('Level 2, an upgrade of Fuel Siphon')
    expect(value(modDetailRows('two-step'), 'Type lock')).toBe('Muscle cars only')
    expect(value(modDetailRows('nitrous-shot'), 'Cost')).toBe(
      '1 fuel from your staged car when played',
    )
    const turbo = modDetailRows('turbo-kit')
    expect(value(turbo, 'Rarity')).toBe('Common: up to 3 per deck')
    expect(value(turbo, 'Level')).toBeUndefined()
    expect(value(turbo, 'Type lock')).toBeUndefined()
  })
})
