import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { MOD_BY_ID } from '../data/mods.ts'
import { copyLimit, createMatch, TUNABLES } from '../engine/index.ts'
import { dealGarage, dealGarages, tierLine } from './randomGarages.ts'

/**
 * A garage the game deals has to be raceable without anyone checking it: nobody edits it, and
 * the engine throws rather than complains, so a bad draw would be a crash on Start.
 */
describe('garages the game deals', () => {
  it('deals a pair the engine accepts, over two hundred seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [a, b] = dealGarages(seed)
      for (const garage of [a, b]) {
        expect(garage.garage, `seed ${seed}`).toHaveLength(TUNABLES.garageSize)
        expect(new Set(garage.garage).size, `seed ${seed}`).toBe(TUNABLES.garageSize)
        expect(garage.deck, `seed ${seed}`).toHaveLength(TUNABLES.modDeckSize)
      }
      // The real bar: createMatch throws on anything it will not race.
      expect(() => createMatch({ players: [a, b] }, seed), `seed ${seed}`).not.toThrow()
    }
  })

  it('never deals more copies of a mod than a deck may hold', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const counts = new Map<string, number>()
      for (const id of dealGarage(seed).deck) counts.set(id, (counts.get(id) ?? 0) + 1)
      for (const [id, n] of counts) {
        expect(n, `seed ${seed}, ${id}`).toBeLessThanOrEqual(copyLimit(id))
      }
    }
  })

  // The builder only warns about this, and the engine does not check it at all, so a dealt
  // garage is the one place nothing would catch a mod its cars can never play.
  it('never deals a type-locked mod without a car of that type', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const garage = dealGarage(seed)
      const types = new Set(garage.garage.map((id) => getCar(id).type))
      for (const id of new Set(garage.deck)) {
        const lock = MOD_BY_ID.get(id)?.typeLock
        if (lock) expect(types.has(lock), `seed ${seed}: ${id} needs a ${lock} car`).toBe(true)
      }
    }
  })

  it('deals the same cards for the same seed, and different ones for another', () => {
    expect(dealGarages(7)).toEqual(dealGarages(7))
    const [mine] = dealGarages(7)
    const [other] = dealGarages(8)
    expect(mine.garage).not.toEqual(other.garage)
  })

  it('deals both seats different garages, so a match is not a mirror', () => {
    let mirrored = 0
    for (let seed = 1; seed <= 50; seed++) {
      const [a, b] = dealGarages(seed)
      if (JSON.stringify(a.garage) === JSON.stringify(b.garage)) mirrored += 1
    }
    expect(mirrored).toBe(0)
  })

  it('names the shape of a garage, worst represented last', () => {
    const line = tierLine(['mazda-mx-5-miata', 'toyota-gr86', 'bugatti-chiron'])
    expect(line).toContain('2 ')
    expect(line).toContain('1 ')
    expect(tierLine([])).toBe('')
  })
})
