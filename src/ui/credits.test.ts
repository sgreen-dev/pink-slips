import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CARS } from '../data/cars.ts'
import { parseCredits } from './credits.ts'

const CREDITS = join(process.cwd(), 'public', 'art', 'CREDITS.md')

/**
 * The parser is checked against the real shipped file, not a fixture. A fixture would only prove
 * the parser reads its own idea of the format, and the thing worth catching is the day
 * `scripts/art/make_art.py` writes a different table and the dialog silently shows nothing.
 */
describe('card art credits', () => {
  const credits = parseCredits(readFileSync(CREDITS, 'utf8'))

  it('reads a row for every illustration in the file', () => {
    const rows = readFileSync(CREDITS, 'utf8')
      .split('\n')
      .filter((line) => /^\| [a-z0-9][a-z0-9-]* \|/.test(line)).length
    expect(credits.length).toBe(rows)
    expect(credits.length).toBeGreaterThan(100)
  })

  it('names a photographer and a licence for every one', () => {
    for (const credit of credits) {
      expect(credit.author, `${credit.carId} has no photographer`).not.toBe('')
      expect(credit.license, `${credit.carId} has no licence`).not.toBe('')
      expect(credit.photoUrl, `${credit.carId} has no link to the photograph`).toMatch(
        /^https:\/\/commons\.wikimedia\.org\//,
      )
    }
  })

  it('credits a car the game actually has', () => {
    const ids = new Set(CARS.map((car) => car.id))
    for (const credit of credits) expect(ids.has(credit.carId), credit.carId).toBe(true)
  })

  it('keeps the name in the table next to the id', () => {
    const named = new Map(CARS.map((car) => [car.id, car.name]))
    for (const credit of credits) expect(credit.car, credit.carId).toBe(named.get(credit.carId))
  })

  it('skips the header and the rule', () => {
    expect(credits.some((credit) => credit.carId === 'Car id')).toBe(false)
    expect(credits.some((credit) => credit.carId.startsWith('---'))).toBe(false)
  })

  it('leaves out a row with no photograph, since nothing is owed for it', () => {
    const drawn = '| some-car | Some Car | Owner illustration | | |'
    expect(parseCredits(drawn)).toEqual([])
  })
})
