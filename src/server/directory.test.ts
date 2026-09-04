import { describe, expect, it } from 'vitest'
import { NO_VARIANTS, ownedCount, starterCollection } from '../collection/collection.ts'
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
    expect(made.data.collection.owned).toEqual(starterCollection())
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

  it('renames within the name rules', async () => {
    const { directory } = setUp()
    const ann = await directory.createPlayer('Ann')
    const renamed = await directory.rename(ann.token, `  ${'x'.repeat(40)}  `)
    expect(renamed?.profile.name).toBe('x'.repeat(24))
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
      ownedCount(starterCollection()),
    )
    for (const card of opened?.pack.cars ?? []) {
      expect(account?.collection.owned[card.id] ?? 0).toBeGreaterThan(0)
    }
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
    expect(NO_VARIANTS).toEqual({ foil: {}, holo: {} })
  })
})
