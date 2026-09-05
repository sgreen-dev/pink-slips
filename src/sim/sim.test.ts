import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { CAR_TYPES, TIERS } from '../data/types.ts'
import { createMatch, seedRng, TUNABLES } from '../engine/index.ts'
import { randomGarage, singleTierGarage, singleTypeGarage, starterGarage } from './garages.ts'
import { checkTargets, formatReport, runSimulation } from './run.ts'
import { median, percentile } from './stats.ts'

function expectValid(garage: { garage: readonly string[]; deck: readonly string[] }) {
  expect(garage.garage).toHaveLength(TUNABLES.garageSize)
  expect(new Set(garage.garage).size).toBe(TUNABLES.garageSize)
  expect(garage.deck).toHaveLength(TUNABLES.modDeckSize)
  const copies = new Map<string, number>()
  for (const id of garage.deck) copies.set(id, (copies.get(id) ?? 0) + 1)
  for (const count of copies.values()) expect(count).toBeLessThanOrEqual(TUNABLES.maxCopiesPerMod)
  const types = new Set(garage.garage.map((id) => getCar(id).type))
  for (const id of garage.deck) {
    const lock = getMod(id).typeLock
    if (lock) expect(types.has(lock), `${id} without a ${lock} car`).toBe(true)
  }
  expect(() => createMatch({ players: [garage, garage] }, 1)).not.toThrow()
}

describe('garage generators', () => {
  it('random garages are valid and vary with the rng', () => {
    const [a, rng] = randomGarage(seedRng(1))
    const [b] = randomGarage(rng)
    expectValid(a)
    expectValid(b)
    expect(a.garage).not.toEqual(b.garage)
  })

  it('random decks hold at most one copy of a rare mod', () => {
    let rng = seedRng(3)
    let most = 0
    for (let i = 0; i < 40; i++) {
      let garage
      ;[garage, rng] = randomGarage(rng)
      most = Math.max(most, garage.deck.filter((id) => id === 'fuel-drain').length)
    }
    expect(most).toBeLessThanOrEqual(TUNABLES.maxCopiesPerRareMod)
  })

  it('single-type garages hold only that type', () => {
    for (const type of CAR_TYPES) {
      const [garage] = singleTypeGarage(type, seedRng(2))
      expectValid(garage)
      for (const id of garage.garage) expect(getCar(id).type).toBe(type)
    }
  })

  it('single-tier garages hold only that tier', () => {
    for (const tier of TIERS) {
      const [garage] = singleTierGarage(tier, seedRng(3))
      expectValid(garage)
      for (const id of garage.garage) expect(getCar(id).tier).toBe(tier)
    }
  })

  it('starter garages come straight from the data', () => {
    for (const index of [0, 1, 2]) expectValid(starterGarage(index))
    expect(() => starterGarage(3)).toThrow()
  })
})

describe('simulation', () => {
  it('runs a small batch and reports every section', () => {
    const report = runSimulation({ matches: 60, seed: 1 })
    expect(report.matches).toBe(60)
    expect(report.lengthsAll).toHaveLength(60)
    expect(report.firstPlayer.games).toBe(60)
    expect([...report.byType.values()].every((t) => t.games > 0)).toBe(true)
    expect([...report.byTier.values()].every((t) => t.games > 0)).toBe(true)
    expect(report.dailyVsHyper.games).toBeGreaterThan(0)
    expect(report.starters.size).toBe(3)
    expect([...report.mods.values()].some((m) => m.plays > 0)).toBe(true)
    const text = formatReport(report)
    expect(text).toContain('Win rate against random garages')
    expect(text).toContain('Targets (DESIGN.md section 7)')
    expect(checkTargets(report)).toHaveLength(4)
  })

  it('is deterministic for a seed', () => {
    const a = formatReport(runSimulation({ matches: 30, seed: 5 })).replace(/, [\d.]+ s/, '')
    const b = formatReport(runSimulation({ matches: 30, seed: 5 })).replace(/, [\d.]+ s/, '')
    expect(a).toBe(b)
  })

  it('computes median and percentile', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 2, 3])).toBe(2.5)
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9)
  })
})
