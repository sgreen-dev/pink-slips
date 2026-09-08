import { describe, expect, it } from 'vitest'
import { CARS } from '../data/cars.ts'
import { MODS, modRarity } from '../data/mods.ts'
import { INTRO_SET, STARTERS } from '../data/starters.ts'
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
  introCollection,
  rebaseToIntro,
  GRANT_VERSION,
  NO_VARIANTS,
  bestVariant,
  grantVariants,
  claimLap,
  garagesAfterLap,
  isComplete,
  ownedCount,
  packCarCount,
} from './collection.ts'
import {
  COLLECTION_KEY,
  REBASE_NOTICE_KEY,
  addPacks,
  clearRebaseNotice,
  loadCollection,
  openNextPack,
  rebaseNoticePending,
} from './persist.ts'

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

const intro = introCollection()
const outsideCar = must(
  CARS.find((car) => !owns(intro, car.id)),
  'car outside the intro set',
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
    const rare = MODS.filter((mod) => modRarity(mod) === 'rare')
    const common = MODS.length - rare.length
    const rareOdds = TUNABLES.collection.rareModOdds
    for (const mod of MODS) {
      const share = (modHits.get(mod.id) ?? 0) / modDraws
      const expected = modRarity(mod) === 'rare' ? rareOdds / rare.length : (1 - rareOdds) / common
      expect(Math.abs(share - expected), mod.id).toBeLessThan(0.006)
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

describe('intro collection', () => {
  it('does not own the rare Fuel Drain until a pack turns it up', () => {
    expect(owns(intro, 'fuel-drain')).toBe(false)
  })

  it('holds exactly the intro set: one copy per car, the granted copies per mod', () => {
    for (const id of INTRO_SET.cars) expect(copiesOwned(intro, id), id).toBe(1)
    for (const [id, copies] of INTRO_SET.mods) expect(copiesOwned(intro, id), id).toBe(copies)
    expect(ownedCount(intro)).toBe(INTRO_SET.cars.length + INTRO_SET.mods.length)
  })

  it('cannot rebuild a loaner garage, which is why loaners are never owned', () => {
    const shortfall = STARTERS.filter(
      (s) =>
        s.cars.some((id) => !owns(intro, id)) ||
        [...countIds(s.deck)].some(([id, count]) => copiesOwned(intro, id) < count),
    )
    expect(shortfall).toHaveLength(STARTERS.length)
  })

  it('leaves every mod below the deck cap, so no pack slot starts dead', () => {
    for (const [id, copies] of INTRO_SET.mods) {
      expect(copies, id).toBeLessThan(TUNABLES.maxCopiesPerMod)
    }
  })

  it('does not hold cars outside the intro set, and counts duplicates', () => {
    expect(owns(intro, outsideCar)).toBe(false)
    const more = grant(intro, [outsideCar, outsideCar])
    expect(copiesOwned(more, outsideCar)).toBe(2)
    expect(copiesOwned(intro, outsideCar)).toBe(0)
  })
})

describe('rebase onto the intro set', () => {
  const legacy = { ...intro, 'lamborghini-aventador-svj': 1, 'pit-crew': 3, 'red-light': 2 }

  it('takes back the legacy free cards and keeps what was earned', () => {
    const earnedCar = outsideCar
    const before = { ...legacy, [earnedCar]: 2 }
    const after = rebaseToIntro(before)
    // Given free by the old grant, in neither the intro set nor a pack: gone.
    expect(owns(after, 'lamborghini-aventador-svj')).toBe(false)
    expect(owns(after, 'red-light')).toBe(false)
    // In the intro set: back to the intro copies, not the legacy three.
    expect(copiesOwned(after, 'pit-crew')).toBe(copiesOwned(intro, 'pit-crew'))
    // Opened or won: kept in full.
    expect(copiesOwned(after, earnedCar)).toBe(2)
  })

  it('adds copies earned above the legacy grant to the intro copies', () => {
    const after = rebaseToIntro({ ...legacy, 'lamborghini-aventador-svj': 3 })
    expect(copiesOwned(after, 'lamborghini-aventador-svj')).toBe(2)
  })

  it('is idempotent: rebasing an already rebased collection changes nothing', () => {
    const once = rebaseToIntro({ ...legacy, [outsideCar]: 1 })
    expect(rebaseToIntro(once)).toEqual(once)
  })

  it('rebases a stored record once, writes the version back, and flags the notice', () => {
    const store = memoryStore({
      [COLLECTION_KEY]: JSON.stringify({ owned: legacy, packs: 2, variants: NO_VARIANTS }),
    })
    const first = loadCollection(store)
    expect(first.grantVersion).toBe(GRANT_VERSION)
    expect(owns(first.owned, 'lamborghini-aventador-svj')).toBe(false)
    expect(first.packs).toBe(2)
    expect(rebaseNoticePending(store)).toBe(true)
    const second = loadCollection(store)
    expect(second.owned).toEqual(first.owned)
  })

  it('leaves a record already on the current grant alone', () => {
    const owned = { ...intro, [outsideCar]: 1 }
    const store = memoryStore({
      [COLLECTION_KEY]: JSON.stringify({
        owned,
        packs: 0,
        variants: NO_VARIANTS,
        laps: 0,
        grantVersion: GRANT_VERSION,
      }),
    })
    expect(loadCollection(store).owned).toEqual(owned)
    expect(store.data.get(REBASE_NOTICE_KEY)).toBeUndefined()
  })

  it('shows the notice once: clearing it survives a later load', () => {
    const store = memoryStore({
      [COLLECTION_KEY]: JSON.stringify({ owned: legacy, packs: 0, variants: NO_VARIANTS }),
    })
    loadCollection(store)
    expect(rebaseNoticePending(store)).toBe(true)
    clearRebaseNotice(store)
    expect(rebaseNoticePending(store)).toBe(false)
    loadCollection(store)
    expect(rebaseNoticePending(store)).toBe(false)
  })
})

describe('persistence', () => {
  const mod = must(
    MODS.find((m) => copiesOwned(intro, m.id) < TUNABLES.maxCopiesPerMod),
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
    expect(state.owned).toEqual(intro)
    expect(JSON.parse(store.data.get(COLLECTION_KEY) ?? '')).toEqual(state)
    const wrongShape = memoryStore({ [COLLECTION_KEY]: JSON.stringify({ owned: 'x', packs: 'y' }) })
    expect(loadCollection(wrongShape).owned).toEqual(intro)
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

  it('reads as the intro set when storage is missing', () => {
    expect(loadCollection(null).owned).toEqual(intro)
    expect(openNextPack(1, null)).toBeNull()
  })
})

describe('variants', () => {
  it('roll foil and holo at the tunable odds over 10,000 packs', () => {
    const hits = { base: 0, foil: 0, holo: 0, chrome: 0 }
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
    const store = memoryStore({ [COLLECTION_KEY]: JSON.stringify({ owned: intro, packs: 1 }) })
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
describe('laps', () => {
  const missingCars = CARS.filter((car) => !owns(intro, car.id)).map((car) => car.id)
  const everyCar = grant(intro, missingCars)
  const secondCar = must(missingCars[1], 'second car outside the starters')

  it('is complete when every car is owned, whatever the mods and finishes', () => {
    expect(isComplete(intro)).toBe(false)
    expect(isComplete(everyCar)).toBe(true)
  })

  it('holds more cars per pack on later laps, capped', () => {
    const { packCars, lapBonusCap } = TUNABLES.collection
    expect(packCarCount(0)).toBe(packCars)
    expect(packCarCount(1)).toBe(packCars + 1)
    expect(packCarCount(5)).toBe(packCars + lapBonusCap)
    const [pack] = openPack(seedRng(3), TUNABLES, 2)
    expect(pack.cars).toHaveLength(packCars + 2)
  })

  it('takes the lap: the intro set plus keepsakes in chrome, packs kept, finishes cleared', () => {
    const before = {
      owned: everyCar,
      packs: 4,
      variants: { foil: { [outsideCar]: 1 }, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: GRANT_VERSION,
    }
    expect(claimLap({ ...before, owned: intro }, outsideCar)).toBeNull()
    expect(claimLap(before, 'not-a-car')).toBeNull()
    const after = must(claimLap(before, outsideCar) ?? undefined, 'first lap')
    expect(after.laps).toBe(1)
    expect(after.packs).toBe(4)
    expect(owns(after.owned, outsideCar)).toBe(true)
    expect(ownedCount(after.owned)).toBe(ownedCount(intro) + 1)
    expect(after.variants).toEqual({ foil: {}, holo: {}, chrome: { [outsideCar]: 1 } })
    expect(bestVariant(after.variants, outsideCar)).toBe('chrome')
    const again = must(
      claimLap({ ...after, owned: everyCar }, secondCar) ?? undefined,
      'second lap',
    )
    expect(again.laps).toBe(2)
    expect(owns(again.owned, outsideCar)).toBe(true)
    expect(owns(again.owned, secondCar)).toBe(true)
    expect(again.variants.chrome).toEqual({ [outsideCar]: 1, [secondCar]: 1 })
  })

  it('drops garages that need a given-up car', () => {
    const garages = [
      { id: 'a', name: 'A', cars: [outsideCar], deck: [], updatedAt: 1 },
      { id: 'b', name: 'B', cars: [], deck: [], updatedAt: 1 },
    ]
    expect(garagesAfterLap(garages, intro).map((g) => g.id)).toEqual(['b'])
    expect(garagesAfterLap(garages, everyCar).map((g) => g.id)).toEqual(['a', 'b'])
  })
})
