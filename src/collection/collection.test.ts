import { describe, expect, it } from 'vitest'
import { CARS } from '../data/cars.ts'
import { MODS, modRarity } from '../data/mods.ts'
import { INTRO_SET, STARTERS } from '../data/starters.ts'
import { TIERS, type Tier } from '../data/types.ts'
import { createMatch, seedRng, TUNABLES } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import type { CollectionState } from '../protocol/records.ts'
import { Directory, type Store } from '../server/directory.ts'
import { GARAGES_KEY, type StorageLike } from '../browser/storage.ts'
import {
  copiesOwned,
  countIds,
  grant,
  openPack,
  owns,
  packCards,
  packsEarned,
  buyCard,
  cardPrice,
  introCollection,
  rebaseToIntro,
  scrapAll,
  scrapValue,
  surplus,
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
  buyLocally,
  claimLapLocally,
  clearRebaseNotice,
  loadCollection,
  openNextPack,
  rebaseNoticePending,
  scrapLocally,
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

/** The service's own store, in memory, for the guest-against-player comparison below. */
class MemoryStore implements Store {
  private readonly data = new Map<string, unknown>()
  async get<T>(key: string) {
    return this.data.get(key) as T | undefined
  }
  async put(key: string, value: unknown) {
    this.data.set(key, structuredClone(value))
  }
  async delete(key: string) {
    this.data.delete(key)
  }
  async list<T>(prefix: string) {
    const out = new Map<string, T>()
    for (const [key, value] of this.data) if (key.startsWith(prefix)) out.set(key, value as T)
    return out
  }
}

/** Reads back what it was given but refuses every write, as a blocked or full browser does. */
function readOnlyStore(initial: Record<string, string> = {}): StorageLike {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
    removeItem: () => {
      throw new Error('QuotaExceededError')
    },
  }
}

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`No ${what}`)
  return value
}

const intro = introCollection()
const outsideCar = must(
  CARS.find((car) => !owns(intro, car.id)),
  'car outside the intro set',
).id

describe('packs', () => {
  it('has cars in every tier a car slot can roll, so no slot falls back (backlog G19)', () => {
    for (const tier of Object.keys(TUNABLES.collection.carTierOdds)) {
      expect(
        CARS.some((car) => car.tier === tier),
        tier,
      ).toBe(true)
    }
  })

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
        credits: 0,
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

  it('replaces a record whose counts are not whole numbers at or above zero', () => {
    // The loader kept a looser copy of the service's checks, so each of these loaded as if it
    // were a collection (backlog S24). A browser only holds one through damage or a hand edit.
    const good = {
      owned: intro,
      packs: 2,
      variants: NO_VARIANTS,
      laps: 0,
      grantVersion: GRANT_VERSION,
      credits: 0,
    }
    for (const broken of [
      { ...good, owned: [1, 2, 3] },
      { ...good, owned: { ...intro, [outsideCar]: -2 } },
      { ...good, variants: { ...NO_VARIANTS, foil: { [outsideCar]: 0.5 } } },
      { ...good, credits: 1.5 },
      { ...good, laps: 'many' },
      { ...good, grantVersion: -1 },
    ]) {
      const store = memoryStore({ [COLLECTION_KEY]: JSON.stringify(broken) })
      expect(loadCollection(store).packs, JSON.stringify(broken)).toBe(0)
    }
    // The same record whole is kept, packs and all.
    expect(loadCollection(memoryStore({ [COLLECTION_KEY]: JSON.stringify(good) })).packs).toBe(2)
  })

  it('still loads a record written before variants, laps, credits or the grant version', () => {
    const old = { owned: { ...intro, [outsideCar]: 1 }, packs: 3 }
    const state = loadCollection(memoryStore({ [COLLECTION_KEY]: JSON.stringify(old) }))
    expect(state.packs).toBe(3)
    expect(state.variants).toEqual(NO_VARIANTS)
  })

  it('opens packs from the stack and keeps what they held', () => {
    const store = memoryStore()
    expect(addPacks(2, store).state.packs).toBe(2)
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
      credits: 0,
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

describe('scrapping and buying', () => {
  const base = (owned: Record<string, number>, credits = 0): CollectionState => ({
    owned: { ...intro, ...owned },
    packs: 0,
    variants: NO_VARIANTS,
    laps: 0,
    grantVersion: GRANT_VERSION,
    credits,
  })

  it('counts only copies no deck could hold', () => {
    // A car is useful at one copy, a common mod at three, the one rare mod at one.
    const state = base({ [outsideCar]: 4, 'turbo-kit': 5, 'fuel-drain': 3 })
    const spare = surplus(state)
    expect(spare.get(outsideCar)).toBe(3)
    expect(spare.get('turbo-kit')).toBe(2)
    expect(spare.get('fuel-drain')).toBe(2)
    // A card at its limit is not spare, and nothing in the intro set is.
    expect(spare.has('wheelspin')).toBe(false)
    expect(surplus(base({})).size).toBe(0)
  })

  it('never scraps a copy wearing a finish', () => {
    const state: CollectionState = {
      ...base({ [outsideCar]: 3 }),
      variants: { foil: { [outsideCar]: 1 }, holo: {}, chrome: {} },
    }
    // Three held, one useful, one foil: only the third is spare.
    expect(surplus(state).get(outsideCar)).toBe(1)
    const after = scrapAll(state)
    expect(after?.owned[outsideCar]).toBe(2)
    // The finish itself is untouched.
    expect(after?.variants.foil[outsideCar]).toBe(1)
  })

  it('leaves every deck still buildable after a scrap', () => {
    const state = base({ 'turbo-kit': 9, [outsideCar]: 4 })
    const after = scrapAll(state)
    if (!after) throw new Error('expected a scrap')
    expect(copiesOwned(after.owned, 'turbo-kit')).toBe(TUNABLES.maxCopiesPerMod)
    expect(copiesOwned(after.owned, outsideCar)).toBe(1)
    // Nothing owned drops below what the builder would let into a deck.
    for (const [id, held] of Object.entries(after.owned)) {
      expect(held, id).toBeGreaterThanOrEqual(Math.min(copiesOwned(state.owned, id), 1))
    }
  })

  it('pays by grade and refuses when there is nothing spare', () => {
    // A Daily car is worth one, its price twenty: about twenty duplicates buys one card.
    const daily = CARS.find((car) => car.tier === 'daily' && !owns(intro, car.id))
    if (!daily) throw new Error('no daily car outside the intro set')
    const state = base({ [daily.id]: 3 })
    expect(scrapValue(state)).toBe(2 * TUNABLES.collection.scrapValue.daily)
    expect(scrapAll(state)?.credits).toBe(2 * TUNABLES.collection.scrapValue.daily)
    expect(scrapAll(base({}))).toBeNull()
  })

  it('buys a card it does not own, and refuses otherwise', () => {
    const price = cardPrice(outsideCar) ?? 0
    const rich = base({}, price)
    const bought = buyCard(rich, outsideCar)
    expect(owns(bought?.owned ?? {}, outsideCar)).toBe(true)
    expect(bought?.credits).toBe(0)
    // A card already owned, one credit short, and a card that does not exist.
    expect(buyCard(rich, Object.keys(intro)[0] as string)).toBeNull()
    expect(buyCard(base({}, price - 1), outsideCar)).toBeNull()
    expect(buyCard(rich, 'not-a-card')).toBeNull()
  })

  // Packs used to be the only way to a second or third copy of a mod, so credits could not
  // finish a deck. Buying now goes up to the copies a deck can hold and stops there.
  it('buys up to the copies a deck can hold, and no further', () => {
    const mod = MODS.find((m) => modRarity(m) !== 'rare')
    if (!mod) throw new Error('no common mod')
    const limit = TUNABLES.maxCopiesPerMod
    const price = must(cardPrice(mod.id), 'a price')
    let state = base({ [mod.id]: 0 }, price * (limit + 2))
    for (let held = 0; held < limit; held++) {
      const next = buyCard(state, mod.id)
      expect(next, `copy ${held + 1}`).not.toBeNull()
      state = next ?? state
      expect(copiesOwned(state.owned, mod.id)).toBe(held + 1)
    }
    // At the limit it is refused, with credits still in hand.
    expect(state.credits).toBeGreaterThanOrEqual(price)
    expect(buyCard(state, mod.id)).toBeNull()
  })

  it('still buys a car only once, since a garage holds one of each', () => {
    const price = must(cardPrice(outsideCar), 'a price')
    const bought = buyCard(base({}, price * 3), outsideCar)
    expect(bought).not.toBeNull()
    expect(buyCard(bought ?? base({}), outsideCar)).toBeNull()
  })

  it('keeps credits across a lap, the way unopened packs are kept', () => {
    const everything = grant(
      intro,
      CARS.filter((car) => !owns(intro, car.id)).map((car) => car.id),
    )
    const state: CollectionState = { ...base({}), owned: everything, packs: 4, credits: 250 }
    const after = claimLap(state, outsideCar)
    expect(after?.credits).toBe(250)
    expect(after?.packs).toBe(4)
  })
})

// A guest's collection lives only in their browser, so a refused write means what the screen is
// showing will not survive a refresh. Every writer has to say so rather than report success.
describe('a browser that refuses to store', () => {
  const stocked = (extra: Partial<CollectionState> = {}) =>
    JSON.stringify({
      owned: grant(introCollection(), ['bugatti-chiron', 'bugatti-chiron', 'bugatti-chiron']),
      packs: 2,
      variants: NO_VARIANTS,
      laps: 0,
      grantVersion: GRANT_VERSION,
      credits: 500,
      ...extra,
    })

  it('still returns the new state, so the page keeps working', () => {
    const store = readOnlyStore({ [COLLECTION_KEY]: stocked() })
    expect(addPacks(3, store).state.packs).toBe(5)
    expect(openNextPack(5, store)?.state.packs).toBe(1)
  })

  it('reports that packs were not stored', () => {
    const store = readOnlyStore({ [COLLECTION_KEY]: stocked() })
    expect(addPacks(3, store).saved).toBe(false)
    expect(openNextPack(5, store)?.saved).toBe(false)
  })

  it('reports that a scrap and a buy were not stored', () => {
    const store = readOnlyStore({ [COLLECTION_KEY]: stocked() })
    const scrapped = scrapLocally(store)
    expect(scrapped?.state.credits).toBeGreaterThan(500)
    expect(scrapped?.saved).toBe(false)
    const bought = buyLocally('toyota-prius', readOnlyStore({ [COLLECTION_KEY]: stocked() }))
    expect(bought?.saved).toBe(false)
  })

  it('says so when it stores, so the flag is not simply always false', () => {
    const store = memoryStore({ [COLLECTION_KEY]: stocked() })
    expect(addPacks(3, store).saved).toBe(true)
    expect(openNextPack(5, store)?.saved).toBe(true)
    expect(scrapLocally(store)?.saved).toBe(true)
  })

  // Nothing to scrap and nothing to buy stay null, so a screen can tell a refused write from an
  // action that was never possible and say the right thing for each.
  it('keeps null for an action that was not possible at all', () => {
    const bare = JSON.stringify({
      owned: introCollection(),
      packs: 0,
      variants: NO_VARIANTS,
      laps: 0,
      grantVersion: GRANT_VERSION,
      credits: 0,
    })
    const store = readOnlyStore({ [COLLECTION_KEY]: bare })
    expect(openNextPack(5, store)).toBeNull()
    expect(scrapLocally(store)).toBeNull()
    expect(buyLocally('toyota-prius', store)).toBeNull()
    expect(claimLapLocally('toyota-prius', store)).toBeNull()
  })
})

/**
 * Phase 30's claim is that a guest and a signed-in player scrap and buy with the same result.
 * The pure rules above are shared, so what these check is that both wrappers reach them with the
 * same collection and store what comes back.
 */
describe('scrapping and buying, guest side and service side', () => {
  const daily = must(
    CARS.find((car) => car.tier === 'daily' && !owns(intro, car.id)),
    'a Daily car outside the intro set',
  )

  const other = must(
    CARS.find((car) => car.tier === 'daily' && !owns(intro, car.id) && car.id !== daily.id),
    'a second Daily car outside the intro set',
  )

  const stocked = (credits = 0) =>
    JSON.stringify({
      owned: { ...intro, [daily.id]: 3 },
      packs: 0,
      variants: NO_VARIANTS,
      laps: 0,
      grantVersion: GRANT_VERSION,
      credits,
    })

  it('the guest scrap pays by grade and writes it back to the browser', () => {
    const store = memoryStore({ [COLLECTION_KEY]: stocked() })
    const next = must(scrapLocally(store), 'a scrap')
    expect(next.state.credits).toBe(2 * TUNABLES.collection.scrapValue.daily)
    expect(next.state.owned[daily.id]).toBe(1)
    expect(next.saved).toBe(true)
    // Read back through loadCollection, so the record really is in the store.
    expect(loadCollection(store)).toEqual(next.state)
    expect(scrapLocally(store)).toBeNull()
  })

  it('the guest buy takes the price and writes it back to the browser', () => {
    const price = must(cardPrice(other.id), 'a price')
    const store = memoryStore({ [COLLECTION_KEY]: stocked(price) })
    const next = must(buyLocally(other.id, store), 'a purchase')
    expect(next.state.credits).toBe(0)
    expect(owns(next.state.owned, other.id)).toBe(true)
    expect(next.saved).toBe(true)
    expect(loadCollection(store)).toEqual(next.state)
    // A car is useful at one copy, so the same buy is refused; so is a card that does not
    // exist, and one the credits no longer stretch to.
    expect(buyLocally(other.id, store)).toBeNull()
    expect(buyLocally('not-a-card', store)).toBeNull()
    expect(buyLocally(daily.id, store)).toBeNull()
  })

  it('leaves a guest and a signed-in player holding the same cards and credits', async () => {
    const price = must(cardPrice(other.id), 'a price')

    // The guest: scrap, then spend on a card they do not own.
    const store = memoryStore({ [COLLECTION_KEY]: stocked(price) })
    must(scrapLocally(store), 'a scrap')
    const guest = must(buyLocally(other.id, store), 'a purchase').state

    // The player: the same collection through the service, the same two calls.
    const directory = new Directory(
      new MemoryStore(),
      () => Math.random().toString(16).slice(2).padEnd(32, '0'),
      async (text) => `hash(${text})`,
      () => 1_000_000,
    )
    const { token } = await directory.createPlayer('Ann')
    await directory.claim(token, {
      collection: JSON.parse(stocked(price)) as CollectionState,
      garages: [],
    })
    const scrapped = await directory.scrap(token)
    expect(scrapped).not.toBe('refused')
    const bought = await directory.buy(token, other.id)
    if (!bought || bought === 'refused') throw new Error('expected a purchase')

    expect(bought.collection.owned).toEqual(guest.owned)
    expect(bought.collection.credits).toBe(guest.credits)
    // And both actually moved, so the comparison cannot pass on two collections that did nothing.
    expect(owns(guest.owned, other.id)).toBe(true)
    expect(guest.owned[daily.id]).toBe(1)
    expect(guest.credits).toBe(2 * TUNABLES.collection.scrapValue.daily)
  })
})
