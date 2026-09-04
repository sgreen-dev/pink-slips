import { describe, expect, it } from 'vitest'
import { NO_VARIANTS, ownedCount, starterCollection } from '../collection/collection.ts'
import { TUNABLES } from '../engine/index.ts'
import type { CollectionState } from '../protocol/records.ts'
import { CPU_RESULT_GAP_MS, Directory, SESSION_TTL_MS, type Store } from './directory.ts'
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

function setUp() {
  let ids = 0
  let clock = 1_000_000
  const store = new MemoryStore()
  const directory = new Directory(
    store,
    () => `id-${++ids}`,
    () => clock,
  )
  return { directory, store, tick: (ms: number) => (clock += ms) }
}

const { packsPerMatch, packsPerCpuWin } = TUNABLES.collection

describe('directory', () => {
  it('creates an account once per provider identity and starts it from the starter set', async () => {
    const { directory } = setUp()
    const first = await directory.signIn('github', '42', '  Ann  ')
    expect(first.created).toBe(true)
    expect(first.data.profile).toMatchObject({
      name: 'Ann',
      rating: TUNABLES.online.ratingStart,
      wins: 0,
      losses: 0,
      packs: 0,
      claimed: false,
    })
    expect(first.data.collection.owned).toEqual(starterCollection())
    const again = await directory.signIn('github', '42', 'Ann')
    expect(again.created).toBe(false)
    expect(again.data.profile.id).toBe(first.data.profile.id)
    expect(again.token).not.toBe(first.token)
    expect((await directory.accountFor(first.token))?.id).toBe(first.data.profile.id)
    expect((await directory.accountFor(again.token))?.id).toBe(first.data.profile.id)
    expect(await directory.accountFor('nope')).toBeNull()
  })

  it('claims guest data once and never again', async () => {
    const { directory } = setUp()
    const { token } = await directory.signIn('github', '1', 'Ann')
    const guest: CollectionState = {
      owned: { ...starterCollection(), 'mazda-mx-5-miata': 3 },
      packs: 3,
      variants: { foil: { 'mazda-mx-5-miata': 1 }, holo: {} },
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
    const { token } = await directory.signIn('github', '1', 'Ann')
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
    const { token } = await directory.signIn('github', '1', 'Ann')
    expect(await directory.openPack(token, 1)).toBeNull()
    await directory.cpuResult(token, 'cpu', true)
    const opened = await directory.openPack(token, 7)
    expect(opened?.pack.cars).toHaveLength(TUNABLES.collection.packCars)
    expect(opened?.data.profile.packs).toBe(packsPerCpuWin - 1)
    const account = await directory.accountFor(token)
    expect(ownedCount(account?.collection.owned ?? {})).toBeGreaterThanOrEqual(
      ownedCount(starterCollection()),
    )
    for (const card of opened?.pack.cars ?? []) {
      expect(account?.collection.owned[card.id] ?? 0).toBeGreaterThan(0)
    }
  })

  it('records a ranked result with Elo, the record, and packs for both sides', async () => {
    const { directory } = setUp()
    const ann = await directory.signIn('github', '1', 'Ann')
    const bo = await directory.signIn('github', '2', 'Bo')
    const a = ann.data.profile.id
    const b = bo.data.profile.id
    const expected = updateRatings(TUNABLES.online.ratingStart, TUNABLES.online.ratingStart)
    const outcome = await directory.recordResult(a, b, true)
    expect(outcome).toEqual({
      winner: { packs: packsPerCpuWin, rating: expected.winner },
      loser: { packs: packsPerMatch, rating: expected.loser },
    })
    expect((await directory.load(a))?.wins).toBe(1)
    expect((await directory.load(b))?.losses).toBe(1)
    expect(await directory.ratedCount()).toBe(2)
    await directory.recordResult(b, a, true)
    expect(await directory.ratedCount()).toBe(2)
    // An unranked room between friends: packs, no rating.
    const before = (await directory.load(a))?.rating
    const friendly = await directory.recordResult(a, b, false)
    expect(friendly.winner).toEqual({ packs: packsPerCpuWin, rating: null })
    expect((await directory.load(a))?.rating).toBe(before)
    expect((await directory.load(a))?.wins).toBe(1)
    // A guest on one side earns nothing here; the account still does.
    const solo = await directory.recordResult(null, a, true)
    expect(solo.winner).toBeNull()
    expect(solo.loser).toEqual({ packs: packsPerMatch, rating: null })
  })

  it('ranks the leaderboard by rating among players with a record', async () => {
    const { directory } = setUp()
    const ids: string[] = []
    for (let i = 0; i < 4; i++) {
      ids.push((await directory.signIn('github', String(i), `P${i}`)).data.profile.id)
    }
    const [p0, p1, p2] = ids as [string, string, string, string]
    await directory.recordResult(p0, p1, true)
    await directory.recordResult(p0, p2, true)
    await directory.recordResult(p2, p1, true)
    const rows = await directory.leaderboard(2)
    expect(rows.map((r) => r.name)).toEqual(['P0', 'P2'])
    expect((await directory.leaderboard()).map((r) => r.name)).toEqual(['P0', 'P2', 'P1'])
  })

  it('expires sessions and honours sign-out', async () => {
    const { directory, tick } = setUp()
    const { token } = await directory.signIn('github', '1', 'Ann')
    tick(SESSION_TTL_MS - 1)
    expect(await directory.accountFor(token)).not.toBeNull()
    tick(2)
    expect(await directory.accountFor(token)).toBeNull()
    const fresh = await directory.signIn('github', '1', 'Ann')
    await directory.signOut(fresh.token)
    expect(await directory.accountFor(fresh.token)).toBeNull()
    expect(NO_VARIANTS).toEqual({ foil: {}, holo: {} })
  })
})
