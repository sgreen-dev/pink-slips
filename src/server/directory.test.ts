import { STARTERS } from '../data/starters.ts'
import { describe, expect, it } from 'vitest'
import {
  cardPrice,
  GRANT_VERSION,
  grant,
  introCollection,
  NO_VARIANTS,
  ownedCount,
  owns,
} from '../collection/collection.ts'
import { LOANER_CAR_IDS } from '../collection/stakes.ts'
import { CARS } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { normalizeRecoveryCode, RECOVERY_LENGTH } from '../protocol/messages.ts'
import type { CollectionState } from '../protocol/records.ts'
import {
  CPU_RESULT_GAP_MS,
  Directory,
  recoveryCodeFrom,
  SESSION_RENEW_MS,
  SESSION_TTL_MS,
  type Store,
} from './directory.ts'
import { updateRatings } from './rating.ts'

class MemoryStore implements Store {
  readonly data = new Map<string, unknown>()
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

function must<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Error(`No ${what}`)
  return value
}

/** Deterministic random values and a reversible fake hash. */
function setUp() {
  let seed = 7
  let clock = 1_000_000
  const store = new MemoryStore()
  // Thirty-two varied hex digits per call, the shape of a UUID without dashes.
  const random = () => {
    let out = ''
    for (let i = 0; i < 32; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      out += ((seed >>> 16) & 15).toString(16)
    }
    return out
  }
  const directory = new Directory(
    store,
    random,
    async (text) => `hash(${text})`,
    () => clock,
  )
  return { directory, store, tick: (ms: number) => (clock += ms) }
}

const { packsPerMatch, packsPerCpuWin } = TUNABLES.collection

describe('directory', () => {
  it('makes a player from a name and starts it from the starter set', async () => {
    const { directory } = setUp()
    const made = await directory.createPlayer('  Ann  ')
    expect(made.data.profile).toMatchObject({
      name: 'Ann',
      rating: TUNABLES.online.ratingStart,
      wins: 0,
      losses: 0,
      packs: 0,
      claimed: false,
    })
    expect(made.data.collection.owned).toEqual(introCollection())
    expect(made.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect((await directory.accountFor(made.token))?.id).toBe(made.data.profile.id)
    expect(await directory.accountFor('nope')).toBeNull()
    const other = await directory.createPlayer('')
    expect(other.data.profile.name).toBe('Player')
    expect(other.data.profile.id).not.toBe(made.data.profile.id)
  })

  it('recovers a player with its code and nobody else', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const bo = await directory.createPlayer('Bo')
    const back = await directory.recover(ann.recoveryCode.toLowerCase().replace(/-/g, ' '))
    expect(back?.data.profile.id).toBe(ann.data.profile.id)
    expect(back?.token).not.toBe(ann.token)
    expect((await directory.accountFor(back?.token ?? ''))?.name).toBe('Ann')
    expect((await directory.recover(bo.recoveryCode))?.data.profile.name).toBe('Bo')
    expect(await directory.recover('AAAA-AAAA-AAAA')).toBeNull()
    expect(await directory.recover('not a code')).toBeNull()
    expect(await directory.recover('')).toBeNull()
  })

  it('rotates the recovery code so the old one stops working', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const fresh = await directory.rotateRecovery(ann.token)
    expect(fresh).not.toBeNull()
    expect(fresh).not.toBe(ann.recoveryCode)
    expect(await directory.recover(ann.recoveryCode)).toBeNull()
    expect((await directory.recover(fresh ?? ''))?.data.profile.id).toBe(ann.data.profile.id)
    expect(await directory.rotateRecovery('nope')).toBeNull()
  })

  it('refuses a blocked name at creation, on rename, and masks one already stored', async () => {
    const { directory, store } = setUp()
    expect(Directory.nameProblem('sh1t')).not.toBeNull()
    expect(Directory.nameProblem('')).toBeNull()
    await expect(directory.createPlayer('sh1t')).rejects.toThrow()
    const ann = await directory.createPlayer('Ann')
    expect((await directory.rename(ann.token, 'b!tch'))?.profile.name).toBe('Ann')
    // A name stored before the filter existed shows as Player everywhere.
    for (const [key, value] of store.data) {
      if (key.startsWith('acct:'))
        store.data.set(key, { ...(value as object), name: 'a$$', wins: 1 })
    }
    expect((await directory.accountFor(ann.token))?.name).toBe('a$$')
    expect((await directory.load(ann.data.profile.id))?.name).toBe('a$$')
    const rows = await directory.leaderboard()
    expect(rows[0]?.name).toBe('Player')
    const me = await directory.accountFor(ann.token)
    expect(me && directory.dataOf(me).profile.name).toBe('Player')
  })

  it('renames within the name rules', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const renamed = await directory.rename(ann.token, `  ${'x'.repeat(24)}  `)
    expect(renamed?.profile.name).toBe('x'.repeat(24))
    // Too long is refused rather than cut, and a non-string changes nothing.
    expect((await directory.rename(ann.token, 'x'.repeat(40)))?.profile.name).toBe('x'.repeat(24))
    expect((await directory.rename(ann.token, 42))?.profile.name).toBe('x'.repeat(24))
    expect((await directory.rename(ann.token, '   '))?.profile.name).toBe('Player')
  })

  it('builds codes from hex and normalises what players type', () => {
    expect(recoveryCodeFrom('00'.repeat(12))).toBe('A'.repeat(RECOVERY_LENGTH))
    expect(recoveryCodeFrom('ff'.repeat(12))).toBe('9'.repeat(RECOVERY_LENGTH))
    expect(() => recoveryCodeFrom('00')).toThrow()
    expect(normalizeRecoveryCode(' abcd-efgh-jklm ')).toBe('ABCDEFGHJKLM')
    expect(normalizeRecoveryCode('ABCD-EFGH-JKL')).toBeNull()
    expect(normalizeRecoveryCode('ABCD-EFGH-JKL0')).toBeNull()
  })

  it('claims guest data once and never again', async () => {
    const { directory } = setUp()
    const { token } = await directory.createPlayer('Ann')
    const guest: CollectionState = {
      owned: { ...introCollection(), 'mazda-mx-5-miata': 3 },
      packs: 3,
      variants: { foil: { 'mazda-mx-5-miata': 1 }, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: GRANT_VERSION,
      credits: 0,
    }
    const garages = [{ id: 'g1', name: 'Mine', cars: ['a'], deck: ['b'], updatedAt: 1 }]
    const data = await directory.claim(token, { collection: guest, garages })
    expect(data?.profile.claimed).toBe(true)
    expect(data?.profile.packs).toBe(3)
    expect(data?.collection.owned['mazda-mx-5-miata']).toBe(3)
    expect(data?.collection.variants.foil['mazda-mx-5-miata']).toBe(1)
    expect(data?.garages).toEqual(garages)
    // The same browser, or another, claiming again changes nothing.
    const second = await directory.claim(token, { collection: { ...guest, packs: 50 }, garages })
    expect(second?.profile.packs).toBe(3)
    expect(second?.garages).toHaveLength(1)
  })

  it('never lets a client award itself a pack', async () => {
    const { directory, tick } = setUp()
    const { token } = await directory.createPlayer('Ann')
    const packsNow = async () => (await directory.accountFor(token))?.collection.packs
    // A malformed claim still uses up the one claim and grants nothing.
    await directory.claim(token, { collection: { owned: {}, packs: 99 }, garages: 'x' })
    expect(await packsNow()).toBe(0)
    // Garage saves ignore everything but garages.
    await directory.saveGarages(token, [{ id: 'g', name: 'G', cars: [], deck: [], updatedAt: 1 }])
    expect(await packsNow()).toBe(0)
    // A CPU result is worth its packs once a minute, and no more.
    const won = await directory.cpuResult(token, 'cpu', true)
    expect(won?.packs).toBe(packsPerCpuWin)
    const repeat = await directory.cpuResult(token, 'cpu', true)
    expect(repeat?.packs).toBe(0)
    expect(await packsNow()).toBe(packsPerCpuWin)
    tick(CPU_RESULT_GAP_MS)
    const later = await directory.cpuResult(token, 'hotseat', false)
    expect(later?.packs).toBe(packsPerMatch)
    tick(CPU_RESULT_GAP_MS)
    expect((await directory.cpuResult(token, 'online', true))?.packs).toBe(0)
    expect(await packsNow()).toBe(packsPerCpuWin + packsPerMatch)
  })

  it('opens packs from the account and stops at an empty stack', async () => {
    const { directory } = setUp()
    const { token } = await directory.createPlayer('Ann')
    expect(await directory.openPack(token, 1)).toBeNull()
    await directory.cpuResult(token, 'cpu', true)
    const opened = await directory.openPack(token, 7)
    expect(opened?.pack.cars).toHaveLength(TUNABLES.collection.packCars)
    expect(opened?.data.profile.packs).toBe(packsPerCpuWin - 1)
    const account = await directory.accountFor(token)
    expect(ownedCount(account?.collection.owned ?? {})).toBeGreaterThanOrEqual(
      ownedCount(introCollection()),
    )
    for (const card of opened?.pack.cars ?? []) {
      expect(account?.collection.owned[card.id] ?? 0).toBeGreaterThan(0)
    }
  })

  /**
   * The creation limit lives on the directory, the one object the whole service shares. In the
   * worker it lived in a module-level Map, which is per isolate: isolates are many, per colo
   * and short-lived, so retrying found an empty count and the limit was not one.
   */
  describe('the limit on new players from one address', () => {
    const { creationsPerWindow: CAP, creationWindowMs: WINDOW } = TUNABLES.online

    it('allows a run of players from an address and then refuses', async () => {
      const { directory } = setUp()
      for (let i = 0; i < CAP; i++) {
        expect(await directory.allowCreation('1.2.3.4'), `attempt ${i + 1}`).toBe(true)
      }
      expect(await directory.allowCreation('1.2.3.4')).toBe(false)
      // Refusing does not reset it either, however many times it is asked.
      expect(await directory.allowCreation('1.2.3.4')).toBe(false)
    })

    it('counts each address on its own', async () => {
      const { directory } = setUp()
      for (let i = 0; i < CAP; i++) await directory.allowCreation('1.2.3.4')
      expect(await directory.allowCreation('1.2.3.4')).toBe(false)
      expect(await directory.allowCreation('5.6.7.8')).toBe(true)
    })

    it('lets the address through again once the window has passed', async () => {
      const { directory, tick } = setUp()
      for (let i = 0; i < CAP; i++) await directory.allowCreation('1.2.3.4')
      expect(await directory.allowCreation('1.2.3.4')).toBe(false)
      // Just short of the window is still refused; past it, allowed.
      tick(WINDOW - 1)
      expect(await directory.allowCreation('1.2.3.4')).toBe(false)
      tick(2)
      expect(await directory.allowCreation('1.2.3.4')).toBe(true)
    })

    it('keeps nothing for an address whose times have all aged out', async () => {
      const { directory, store, tick } = setUp()
      await directory.allowCreation('1.2.3.4')
      expect(store.data.get('made:1.2.3.4')).toEqual([1_000_000])
      tick(WINDOW + 1)
      await directory.allowCreation('1.2.3.4')
      // The old time is gone rather than accumulating for every address ever seen.
      expect(store.data.get('made:1.2.3.4')).toEqual([1_000_000 + WINDOW + 1])
    })

    it('survives the object being rebuilt, which is what the worker map did not', async () => {
      const { directory, store } = setUp()
      for (let i = 0; i < CAP; i++) await directory.allowCreation('1.2.3.4')
      // A second Directory over the same storage stands for another isolate, or this object
      // waking after hibernation: the count is in the store, so it is still there.
      const again = new Directory(
        store,
        () => 'x'.repeat(32),
        async (t) => t,
        () => 1_000_000,
      )
      expect(await again.allowCreation('1.2.3.4')).toBe(false)
    })
  })

  // Scrapping and buying on the service side (DESIGN.md 12). The pure rules are tested in
  // src/collection/collection.test.ts; these cover the wrappers that read a token, store the
  // result, and answer 'refused' rather than throwing.
  describe('scrapping and buying', () => {
    const outside = must(
      CARS.find((car) => car.tier === 'daily' && !owns(introCollection(), car.id)),
      'a Daily car outside the intro set',
    )

    /** A player whose collection holds spare copies and the credits given. */
    async function stocked(spares: Record<string, number>, credits = 0) {
      const { directory, store } = setUp()
      const { token } = await directory.createPlayer('Ann')
      const guest: CollectionState = {
        owned: { ...introCollection(), ...spares },
        packs: 0,
        variants: NO_VARIANTS,
        laps: 0,
        grantVersion: GRANT_VERSION,
        credits,
      }
      await directory.claim(token, { collection: guest, garages: [] })
      return { directory, store, token }
    }

    it('pays by grade, stores the credits, and refuses a second time', async () => {
      const { directory, token } = await stocked({ [outside.id]: 3 })
      const data = await directory.scrap(token)
      expect(data).not.toBe('refused')
      if (!data || data === 'refused') throw new Error('expected a scrap')
      // Three held, one useful: two spare at the Daily rate.
      expect(data.collection.credits).toBe(2 * TUNABLES.collection.scrapValue.daily)
      expect(data.collection.owned[outside.id]).toBe(1)
      // Stored, not just returned.
      const account = await directory.accountFor(token)
      expect(account?.collection.credits).toBe(data.collection.credits)
      // Nothing spare is left, so a second scrap is refused rather than paying again.
      expect(await directory.scrap(token)).toBe('refused')
    })

    it('buys a card the account does not own and takes the price', async () => {
      const price = must(cardPrice(outside.id), 'a price')
      const { directory, token } = await stocked({}, price)
      const data = await directory.buy(token, outside.id)
      if (!data || data === 'refused') throw new Error('expected a purchase')
      expect(owns(data.collection.owned, outside.id)).toBe(true)
      expect(data.collection.credits).toBe(0)
      const account = await directory.accountFor(token)
      expect(owns(account?.collection.owned ?? {}, outside.id)).toBe(true)
    })

    it('refuses a card already owned, one it cannot afford, and anything that is not a card', async () => {
      const price = must(cardPrice(outside.id), 'a price')
      const { directory, token } = await stocked({}, price - 1)
      expect(await directory.buy(token, outside.id)).toBe('refused')
      expect(await directory.buy(token, 'not-a-card')).toBe('refused')
      // A client can send anything, so a non-string is refused before it reaches the rules.
      expect(await directory.buy(token, 42)).toBe('refused')
      expect(await directory.buy(token, null)).toBe('refused')
      expect(await directory.buy(token, { id: outside.id })).toBe('refused')
      const owned = must(Object.keys(introCollection())[0], 'an owned card')
      const { directory: rich, token: richToken } = await stocked({}, price)
      expect(await rich.buy(richToken, owned)).toBe('refused')
    })

    it('answers null to a token that is not a session, so neither can be used signed out', async () => {
      const { directory } = await stocked({ [outside.id]: 3 }, 1000)
      expect(await directory.scrap('not-a-token')).toBeNull()
      expect(await directory.buy('not-a-token', outside.id)).toBeNull()
    })
  })

  it('records a ranked result with Elo, the record, and packs for both sides', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const bo = await directory.createPlayer('Bo')
    const a = ann.data.profile.id
    const b = bo.data.profile.id
    const expected = updateRatings(TUNABLES.online.ratingStart, TUNABLES.online.ratingStart)
    const outcome = await directory.recordResult(a, b, true)
    expect(outcome).toEqual({
      winner: { packs: packsPerCpuWin, rating: expected.winner, stakes: null },
      loser: { packs: packsPerMatch, rating: expected.loser, stakes: null },
    })
    expect((await directory.load(a))?.wins).toBe(1)
    expect((await directory.load(b))?.losses).toBe(1)
    expect(await directory.ratedCount()).toBe(2)
    await directory.recordResult(b, a, true)
    expect(await directory.ratedCount()).toBe(2)
    // An unranked room between friends: packs, no rating.
    const before = (await directory.load(a))?.rating
    const friendly = await directory.recordResult(a, b, false)
    expect(friendly.winner).toEqual({ packs: packsPerCpuWin, rating: null, stakes: null })
    expect((await directory.load(a))?.rating).toBe(before)
    expect((await directory.load(a))?.wins).toBe(1)
    // A match given up before any race moves ratings but pays no packs.
    const empty = await directory.recordResult(a, b, true, false)
    expect(empty.winner?.packs).toBe(0)
    expect(empty.loser?.packs).toBe(0)
    expect(empty.winner?.rating).not.toBeNull()
    // A guest on one side earns nothing here; the account still does.
    const solo = await directory.recordResult(null, a, true)
    expect(solo.winner).toBeNull()
    expect(solo.loser).toEqual({ packs: packsPerMatch, rating: null, stakes: null })
  })

  it('ranks the leaderboard by rating among players with a record', async () => {
    const { directory } = setUp()
    const ids: string[] = []
    for (let i = 0; i < 4; i++) ids.push((await directory.createPlayer(`P${i}`)).data.profile.id)
    const [p0, p1, p2] = ids as [string, string, string, string]
    await directory.recordResult(p0, p1, true)
    await directory.recordResult(p0, p2, true)
    await directory.recordResult(p2, p1, true)
    const rows = await directory.leaderboard(2)
    expect(rows.map((r) => r.name)).toEqual(['P0', 'P2'])
    expect((await directory.leaderboard()).map((r) => r.name)).toEqual(['P0', 'P2', 'P1'])
  })

  it('keeps a session alive while it is used and ends it on sign-out', async () => {
    const { directory, tick } = setUp()
    const { token } = await directory.createPlayer('Ann')
    // Used once a month, the session never runs out.
    for (let month = 0; month < 24; month++) {
      tick(30 * SESSION_RENEW_MS)
      expect(await directory.accountFor(token)).not.toBeNull()
    }
    // Left alone for over a year, it does.
    tick(SESSION_TTL_MS + 1)
    expect(await directory.accountFor(token)).toBeNull()
    const fresh = await directory.createPlayer('Ann')
    await directory.signOut(fresh.token)
    expect(await directory.accountFor(fresh.token)).toBeNull()
    expect(NO_VARIANTS).toEqual({ foil: {}, holo: {}, chrome: {} })
  })
})

describe('stakes on the service', () => {
  const CHIRON = 'bugatti-chiron'
  const F40 = 'ferrari-f40'

  /**
   * A CPU match runs in the browser, so the service takes the client's word for the result.
   * These say what that word is worth: packs at one report a minute, losses as reported, and
   * nothing gained, since stakes need a loaner on the CPU side and no loaner car can change
   * hands (DESIGN.md 12).
   */
  it('takes the losses a CPU report claims but never the gains', async () => {
    const { directory } = setUp()
    const { token } = await directory.createPlayer('Ann')
    await directory.claim(token, {
      collection: {
        owned: { ...introCollection(), [F40]: 1 },
        packs: 0,
        variants: NO_VARIANTS,
        laps: 0,
        grantVersion: GRANT_VERSION,
        credits: 0,
      } satisfies CollectionState,
      garages: [],
    })
    const first = await directory.cpuResult(token, 'cpu', true, {
      gained: [CHIRON, STARTERS[0]?.cars[0] ?? '', 'no-such-car'],
      lost: [F40],
    })
    expect(first?.stakes).toEqual({ gained: [], lost: [F40] })
    expect(first?.data.collection.owned[CHIRON] ?? 0).toBe(0)
    expect(first?.data.collection.owned[F40]).toBe(0)
    // The packs the match really earned still arrive; only the invented cars are dropped.
    expect(first?.packs).toBe(packsPerCpuWin)
  })

  it('mints nothing however many cars a report claims, even at a minute apart', async () => {
    const { directory, tick } = setUp()
    const { token } = await directory.createPlayer('Ann')
    const hypers = CARS.filter((car) => car.tier === 'hyper' && !LOANER_CAR_IDS.has(car.id))
      .slice(0, 3)
      .map((car) => car.id)
    const before = (await directory.accountFor(token))?.collection.owned
    for (let attempt = 0; attempt < 5; attempt++) {
      await directory.cpuResult(token, 'cpu', true, { gained: hypers, lost: [] })
      tick(CPU_RESULT_GAP_MS)
    }
    const after = await directory.accountFor(token)
    expect(after?.collection.owned).toEqual(before)
  })

  it('applies a report once a minute and never for hotseat', async () => {
    const { directory, tick } = setUp()
    const { token } = await directory.createPlayer('Ann')
    await directory.claim(token, {
      collection: {
        owned: { ...introCollection(), [CHIRON]: 1, [F40]: 1 },
        packs: 0,
        variants: NO_VARIANTS,
        laps: 0,
        grantVersion: GRANT_VERSION,
        credits: 0,
      } satisfies CollectionState,
      garages: [],
    })
    expect(
      (await directory.cpuResult(token, 'cpu', false, { gained: [], lost: [CHIRON] }))?.stakes,
    ).toEqual({ gained: [], lost: [CHIRON] })
    // Within the minute nothing more is applied, packs or cars.
    const repeat = await directory.cpuResult(token, 'cpu', false, { gained: [], lost: [F40] })
    expect(repeat?.stakes).toBeNull()
    expect(repeat?.data.collection.owned[F40]).toBe(1)
    tick(CPU_RESULT_GAP_MS)
    // Hotseat has no stakes, whatever the client sends.
    const hotseat = await directory.cpuResult(token, 'hotseat', true, { gained: [], lost: [F40] })
    expect(hotseat?.stakes).toBeNull()
    expect(hotseat?.data.collection.owned[F40]).toBe(1)
  })

  it('moves the pink slips between two accounts at a match result', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const bo = await directory.createPlayer('Bo')
    const annId = (await directory.accountFor(ann.token))?.id ?? ''
    const boId = (await directory.accountFor(bo.token))?.id ?? ''
    const outcome = await directory.recordResult(annId, boId, true, true, {
      winner: { gained: [CHIRON, F40], lost: [] },
      loser: { gained: [], lost: [CHIRON, F40] },
    })
    expect(outcome.winner?.stakes).toEqual({ gained: [CHIRON, F40], lost: [] })
    expect(outcome.loser?.stakes).toEqual({ gained: [], lost: [CHIRON, F40] })
    const annNow = await directory.accountFor(ann.token)
    const boNow = await directory.accountFor(bo.token)
    expect(annNow?.collection.owned[CHIRON]).toBe(1)
    expect(boNow?.collection.owned[CHIRON] ?? 0).toBe(0)
    const plain = await directory.recordResult(annId, boId, true, true)
    expect(plain.winner?.stakes).toBeNull()
  })
})
describe('laps on the service', () => {
  const intro = introCollection()
  const outside = CARS.filter((car) => !owns(intro, car.id)).map((car) => car.id)
  const everyCar = grant(intro, outside)
  const spare = outside[0] ?? ''
  const other = outside[1] ?? ''

  it('takes the lap once every car is owned, prunes garages, and carries laps through a claim', async () => {
    const { directory } = setUp()
    const { token } = await directory.createPlayer('Ann')
    expect(await directory.claimLap(token, spare)).toBe('refused')
    await directory.claim(token, {
      collection: {
        owned: everyCar,
        packs: 2,
        variants: NO_VARIANTS,
        laps: 1,
        grantVersion: GRANT_VERSION,
        credits: 0,
      },
      garages: [
        { id: 'keep', name: 'Keep', cars: [spare], deck: [], updatedAt: 1 },
        { id: 'gone', name: 'Gone', cars: [other], deck: [], updatedAt: 1 },
      ],
    })
    const data = await directory.claimLap(token, spare)
    if (!data || data === 'refused') throw new Error('The lap was refused')
    expect(data.profile.laps).toBe(2)
    expect(data.collection.packs).toBe(2)
    expect(data.collection.variants.chrome).toEqual({ [spare]: 1 })
    expect(owns(data.collection.owned, spare)).toBe(true)
    expect(owns(data.collection.owned, other)).toBe(false)
    expect(data.garages.map((g) => g.id)).toEqual(['keep'])
    expect(await directory.claimLap(token, spare)).toBe('refused')
  })
})

describe('rebase onto the intro set', () => {
  /** Writes the account's collection back as a record on the legacy grant. */
  async function makeLegacy(store: MemoryStore, id: string, extra: Record<string, number>) {
    const key = `acct:${id}`
    const account = store.data.get(key) as { collection: CollectionState }
    store.data.set(key, {
      ...account,
      collection: {
        owned: { ...LEGACY_OWNED, ...extra },
        packs: 3,
        variants: NO_VARIANTS,
        laps: 0,
      },
    })
  }

  /** The old grant: the union of the loaner garages at the copies the deck using each most needed. */
  const LEGACY_OWNED: Record<string, number> = {}
  for (const s of STARTERS) {
    for (const id of s.cars) LEGACY_OWNED[id] = 1
    const counts = new Map<string, number>()
    for (const id of s.deck) counts.set(id, (counts.get(id) ?? 0) + 1)
    for (const [id, n] of counts) LEGACY_OWNED[id] = Math.max(LEGACY_OWNED[id] ?? 0, n)
  }

  it('rebases an account on the legacy grant once, on load, and keeps what was earned', async () => {
    const { directory, store } = setUp()
    const { token, data } = await directory.createPlayer('Ann')
    const chiron = 'bugatti-chiron'
    await makeLegacy(store, data.profile.id, { [chiron]: 2 })

    const account = await directory.accountFor(token)
    expect(account?.collection.grantVersion).toBe(GRANT_VERSION)
    // Free under the old grant, absent from the intro set: taken back.
    expect(owns(account?.collection.owned ?? {}, 'lamborghini-aventador-svj')).toBe(false)
    expect(owns(account?.collection.owned ?? {}, 'red-light')).toBe(false)
    // Opened: kept in full. Packs and everything else untouched.
    expect(account?.collection.owned[chiron]).toBe(2)
    expect(account?.collection.packs).toBe(3)
    // Written back, so the rebase never runs twice.
    const stored = store.data.get(`acct:${data.profile.id}`) as { collection: CollectionState }
    expect(stored.collection.grantVersion).toBe(GRANT_VERSION)
  })

  it('rebases a guest record on claim, so the merge cannot hand the legacy cards back', async () => {
    const { directory } = setUp()
    const { token } = await directory.createPlayer('Bo')
    await directory.claim(token, {
      collection: { owned: { ...LEGACY_OWNED }, packs: 1, variants: NO_VARIANTS, laps: 0 },
      garages: [],
    })
    const account = await directory.accountFor(token)
    expect(owns(account?.collection.owned ?? {}, 'lamborghini-aventador-svj')).toBe(false)
    expect(account?.collection.grantVersion).toBe(GRANT_VERSION)
  })
})
