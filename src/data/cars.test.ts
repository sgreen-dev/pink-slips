import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARS, getCar } from './cars.ts'
import { isJudgmentPlacement, powerToWeight, tierForRatio } from './tiers.ts'
import { CAR_TYPES, TIERS, type CarType, type Tier } from './types.ts'

const PUBLIC = join(process.cwd(), 'public')

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
  ['offroad', 'hyper'],
  ['jdm', 'hyper'],
]

describe('cars', () => {
  it('has 126 cars', () => {
    expect(CARS).toHaveLength(126)
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

  it('points imageUrl at an existing illustration under /art/, or leaves it empty', () => {
    const used = new Set<string>()
    for (const car of CARS) {
      if (car.imageUrl === '') continue
      expect(car.imageUrl, car.id).toMatch(/^\/art\/[a-z0-9-]+\.webp$/)
      expect(used.has(car.imageUrl), `${car.imageUrl} is used twice`).toBe(false)
      used.add(car.imageUrl)
      expect(existsSync(join(PUBLIC, car.imageUrl)), `${car.imageUrl} is missing`).toBe(true)
    }
  })

  it('keeps every illustration under budget and credited', () => {
    const dir = join(PUBLIC, 'art')
    if (!existsSync(dir)) return
    const files = readdirSync(dir).filter((file) => file.endsWith('.webp'))
    const creditsPath = join(dir, 'CREDITS.md')
    const credits = existsSync(creditsPath) ? readFileSync(creditsPath, 'utf8') : ''
    let total = 0
    for (const file of files) {
      const size = statSync(join(dir, file)).size
      expect(size, `${file} is over 60 KB`).toBeLessThanOrEqual(60_000)
      total += size
      const carId = file.replace(/\.webp$/, '')
      expect(
        CARS.some((car) => car.id === carId),
        `${file} is not a car`,
      ).toBe(true)
      expect(credits, `${file} has no credit line`).toContain(`| ${carId} |`)
    }
    expect(total, 'art over 4 MB in total').toBeLessThanOrEqual(4_000_000)
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
