import { describe, expect, it } from 'vitest'
import { CARS } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { STARTERS } from '../data/starters.ts'
import { TIERS, type Tier } from '../data/types.ts'
import { createMatch, seedRng, TUNABLES } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { GARAGES_KEY, type StorageLike } from '../ui/storage.ts'
import {
  copiesOwned,
  countIds,
  grant,
  openPack,
  owns,
  packCards,
  packsEarned,
  starterCollection,
  NO_VARIANTS,
  bestVariant,
  grantVariants,
} from './collection.ts'
import { COLLECTION_KEY, addPacks, loadCollection, openNextPack } from './persist.ts'

function memoryStore(
  initial: Record<string, string> = {},
): StorageLike & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`No ${what}`)
  return value
}

const starter = starterCollection()
const outsideCar = must(
  CARS.find((car) => !owns(starter, car.id)),
  'car outside the starters',
).id

describe('packs', () => {
  it('follow the tier odds and spread mods evenly over 10,000 packs', () => {
    const tierHits = new Map<Tier, number>()
    const modHits = new Map<string, number>()
    let rng = seedRng(7)
    let pack
    for (let i = 0; i < 10_000; i++) {
      ;[pack, rng] = openPack(rng)
      expect(pack.cars).toHaveLength(TUNABLES.collection.packCars)
      expect(pack.mods).toHaveLength(TUNABLES.collection.packMods)
      for (const { id } of pack.cars) {
        const tier = must(
          CARS.find((car) => car.id === id),
          id,
        ).tier
        tierHits.set(tier, (tierHits.get(tier) ?? 0) + 1)
      }
      for (const { id } of pack.mods) modHits.set(id, (modHits.get(id) ?? 0) + 1)
    }
    const carDraws = 10_000 * TUNABLES.collection.packCars
    for (const tier of TIERS) {
      const share = (tierHits.get(tier) ?? 0) / carDraws
      expect(Math.abs(share - TUNABLES.collection.carTierOdds[tier]), tier).toBeLessThan(0.01)
    }
    const modDraws = 10_000 * TUNABLES.collection.packMods
    for (const mod of MODS) {
      const share = (modHits.get(mod.id) ?? 0) / modDraws
      expect(Math.abs(share - 1 / MODS.length), mod.id).toBeLessThan(0.006)
    }
  })

  it('are the same for the same seed', () => {
    expect(openPack(seedRng(42))[0]).toEqual(openPack(seedRng(42))[0])
  })

  it('pay by mode and result', () => {
    expect(packsEarned('cpu', true)).toBe(TUNABLES.collection.packsPerCpuWin)
    expect(packsEarned('cpu', false)).toBe(TUNABLES.collection.packsPerMatch)
    expect(packsEarned('hotseat', false)).toBe(TUNABLES.collection.packsPerMatch)
  })
})

describe('starter collection', () => {
  it('holds every starter card with enough copies to rebuild each starter', () => {
    for (const s of STARTERS) {
      for (const id of s.cars) expect(owns(starter, id), id).toBe(true)
      for (const [id, count] of countIds(s.deck)) {
        expect(copiesOwned(starter, id), id).toBeGreaterThanOrEqual(count)
      }
    }
  })

  it('does not hold cars outside the starters, and counts duplicates', () => {
    expect(owns(starter, outsideCar)).toBe(false)
    const more = grant(starter, [outsideCar, outsideCar])
    expect(copiesOwned(more, outsideCar)).toBe(2)
    expect(copiesOwned(starter, outsideCar)).toBe(0)
  })
})

describe('persistence', () => {
  const mod = must(
    MODS.find((m) => copiesOwned(starter, m.id) < TUNABLES.maxCopiesPerMod),
    'mod with room to grant',
  ).id
  const oldGarage = {
    id: 'old',
    name: 'Built on v1',
    cars: [outsideCar, ...(STARTERS[0]?.cars.slice(1) ?? [])],
    deck: [mod, mod, mod, ...(STARTERS[0]?.deck.filter((id) => id !== mod).slice(0, 27) ?? [])],
    updatedAt: 1,
  }

  it('grants the cards of a garage saved before collections existed, once', () => {
    const store = memoryStore({ [GARAGES_KEY]: JSON.stringify([oldGarage]) })
    const first = loadCollection(store)
    expect(copiesOwned(first.owned, outsideCar)).toBe(1)
    expect(copiesOwned(first.owned, mod)).toBe(3)
    expect(first.packs).toBe(0)
    expect(store.data.has(COLLECTION_KEY)).toBe(true)
    // Loading again, even with the garage saved twice, changes nothing.
    store.setItem(GARAGES_KEY, JSON.stringify([oldGarage, { ...oldGarage, id: 'copy' }]))
    expect(loadCollection(store)).toEqual(first)
  })

  it('starts fresh when the record is corrupt, and repairs it', () => {
    const store = memoryStore({ [COLLECTION_KEY]: '{not json' })
    const state = loadCollection(store)
    expect(state.packs).toBe(0)
    expect(state.owned).toEqual(starter)
    expect(JSON.parse(store.data.get(COLLECTION_KEY) ?? '')).toEqual(state)
    const wrongShape = memoryStore({ [COLLECTION_KEY]: JSON.stringify({ owned: 'x', packs: 'y' }) })
    expect(loadCollection(wrongShape).owned).toEqual(starter)
  })

  it('opens packs from the stack and keeps what they held', () => {
    const store = memoryStore()
    expect(addPacks(2, store).packs).toBe(2)
    const opened = openNextPack(5, store)
    expect(opened).not.toBeNull()
    if (!opened) return
    expect(opened.state.packs).toBe(1)
    for (const { id } of packCards(opened.pack)) {
      expect(copiesOwned(opened.state.owned, id)).toBeGreaterThanOrEqual(1)
    }
    expect(loadCollection(store)).toEqual(opened.state)
    expect(openNextPack(6, store)?.state.packs).toBe(0)
    expect(openNextPack(7, store)).toBeNull()
  })

  it('reads as the starter set when storage is missing', () => {
    expect(loadCollection(null).owned).toEqual(starter)
    expect(openNextPack(1, null)).toBeNull()
  })
})

describe('variants', () => {
  it('roll foil and holo at the tunable odds over 10,000 packs', () => {
    const hits = { base: 0, foil: 0, holo: 0 }
    let rng = seedRng(11)
    let pack
    for (let i = 0; i < 10_000; i++) {
      ;[pack, rng] = openPack(rng)
      for (const card of packCards(pack)) hits[card.variant]++
    }
    const total = 10_000 * (TUNABLES.collection.packCars + TUNABLES.collection.packMods)
    expect(Math.abs(hits.holo / total - TUNABLES.collection.holoOdds)).toBeLessThan(0.004)
    expect(Math.abs(hits.foil / total - TUNABLES.collection.foilOdds)).toBeLessThan(0.008)
    expect(hits.base).toBeGreaterThan(hits.foil)
    expect(hits.foil).toBeGreaterThan(hits.holo)
  })

  it('show the best finish owned', () => {
    const counts = grantVariants(NO_VARIANTS, [
      { id: 'a', variant: 'foil' },
      { id: 'b', variant: 'holo' },
      { id: 'b', variant: 'foil' },
      { id: 'c', variant: 'base' },
    ])
    expect(bestVariant(counts, 'a')).toBe('foil')
    expect(bestVariant(counts, 'b')).toBe('holo')
    expect(bestVariant(counts, 'c')).toBe('base')
    expect(bestVariant(counts, 'never-seen')).toBe('base')
    expect(copiesOwned(counts.foil, 'b')).toBe(1)
    expect(copiesOwned(counts.holo, 'b')).toBe(1)
  })

  it('never reach the engine', () => {
    const config = starterConfig()
    const state = createMatch(config, 1)
    expect(JSON.stringify(config) + JSON.stringify(state)).not.toMatch(/foil|holo|variant/i)
  })

  it('persist next to the counts and default to none for older records', () => {
    const store = memoryStore({ [COLLECTION_KEY]: JSON.stringify({ owned: starter, packs: 1 }) })
    expect(loadCollection(store).variants).toEqual(NO_VARIANTS)
    const opened = openNextPack(3, store)
    if (!opened) throw new Error('No pack to open')
    for (const card of packCards(opened.pack)) {
      if (card.variant === 'base') continue
      expect(copiesOwned(opened.state.variants[card.variant], card.id)).toBeGreaterThanOrEqual(1)
    }
    expect(loadCollection(store).variants).toEqual(opened.state.variants)
  })
})
