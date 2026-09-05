import { describe, expect, it } from 'vitest'
import { TUNABLES } from '../engine/index.ts'
import { dedupe, pickPair, type Waiting } from './queue.ts'
import { expectedScore, updateRatings } from './rating.ts'

describe('rating', () => {
  it('matches Elo worked by hand for a win, a loss, and an upset', () => {
    // Equal players: expected 0.5, so the winner gains K/2 and the loser drops K/2.
    expect(updateRatings(1000, 1000)).toEqual({
      winner: { before: 1000, after: 1016 },
      loser: { before: 1000, after: 984 },
    })
    // The favourite wins: 1200 over 1000 expects 0.76, so gains 32 × 0.24 = 7.7, rounded 8.
    expect(updateRatings(1200, 1000)).toEqual({
      winner: { before: 1200, after: 1208 },
      loser: { before: 1000, after: 992 },
    })
    // The upset: 1000 over 1200 expects 0.24, so gains 32 × 0.76 = 24.3, rounded 24.
    expect(updateRatings(1000, 1200)).toEqual({
      winner: { before: 1000, after: 1024 },
      loser: { before: 1200, after: 1176 },
    })
    expect(expectedScore(1000, 1000)).toBe(0.5)
    expect(expectedScore(1400, 1000)).toBeCloseTo(0.909, 3)
    expect(TUNABLES.online.ratingK).toBe(32)
  })
})

describe('queue', () => {
  it('pairs stakes players only with each other', () => {
    const plain = { accountId: 'p', rating: 1000, since: 1000 }
    const stakes = { accountId: 's', rating: 1000, since: 1000, stakes: true }
    const other = { accountId: 't', rating: 1000, since: 1500, stakes: true }
    expect(pickPair([plain, stakes], 4000, 0)).toBeNull()
    expect(pickPair([plain, stakes, other], 4000, 0)?.map((w) => w.accountId)).toEqual(['s', 't'])
  })

  const at = (accountId: string, since: number, rating = 1000): Waiting => ({
    accountId,
    rating,
    since,
  })

  it('pairs the two longest-waiting players', () => {
    const entries = [at('c', 3000), at('a', 1000), at('b', 2000)]
    expect(pickPair(entries, 4000, 0)?.map((w) => w.accountId)).toEqual(['a', 'b'])
    expect(pickPair([at('a', 1000)], 4000, 0)).toBeNull()
    expect(pickPair([], 4000, 0)).toBeNull()
  })

  it('never pairs a player with themselves', () => {
    const twice = [at('a', 1000), at('a', 2000)]
    expect(dedupe(twice)).toEqual([at('a', 1000)])
    expect(pickPair(twice, 5000, 0)).toBeNull()
    expect(pickPair([...twice, at('b', 3000)], 5000, 0)?.map((w) => w.accountId)).toEqual([
      'a',
      'b',
    ])
  })

  it('keeps fresh players within the rating window once enough players are rated', () => {
    const { pairMinRated, pairWaitMs, pairWindow } = TUNABLES.online
    const far = pairWindow + 1
    const now = 10_000
    const fresh = [at('a', now - 1000, 1000), at('b', now - 500, 1000 + far)]
    // Below the minimum the window does not apply.
    expect(pickPair(fresh, now, pairMinRated)?.map((w) => w.accountId)).toEqual(['a', 'b'])
    // Above it, two fresh players too far apart wait.
    expect(pickPair(fresh, now, pairMinRated + 1)).toBeNull()
    // A third player within the window of the longest waiter is taken instead.
    const withThird = [...fresh, at('c', now - 100, 1000 + pairWindow)]
    expect(pickPair(withThird, now, pairMinRated + 1)?.map((w) => w.accountId)).toEqual(['a', 'c'])
    // Once one of them has waited long enough, anyone will do.
    const stale = [at('a', now - pairWaitMs, 1000), at('b', now - 500, 1000 + far)]
    expect(pickPair(stale, now, pairMinRated + 1)?.map((w) => w.accountId)).toEqual(['a', 'b'])
  })
})
