import { TUNABLES } from '../engine/index.ts'
import type { RatingChange } from '../protocol/messages.ts'

/**
 * Elo ratings for online play (DESIGN.md 13). Every account starts at the same number, and
 * each rated match moves the two ratings by K times the surprise: a favourite gains little
 * and an underdog gains a lot. Ratings are kept as whole numbers.
 */

/** The chance, between 0 and 1, that a player rated `rating` beats one rated `opponent`. */
export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + 10 ** ((opponent - rating) / 400))
}

export function updateRatings(
  winner: number,
  loser: number,
  t: typeof TUNABLES = TUNABLES,
): { winner: RatingChange; loser: RatingChange } {
  const k = t.online.ratingK
  const expected = expectedScore(winner, loser)
  const swing = k * (1 - expected)
  return {
    winner: { before: winner, after: Math.round(winner + swing) },
    loser: { before: loser, after: Math.round(loser - swing) },
  }
}
