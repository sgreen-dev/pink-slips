import { describe, expect, it } from 'vitest'
import { createMatch } from './match.ts'
import { starterConfig } from './test-helpers.ts'

describe('a named first player', () => {
  it('skips the coin flip and gives the first move to that player', () => {
    for (const first of [0, 1] as const) {
      const match = createMatch({ ...starterConfig(), firstPlayer: first }, 7)
      expect(match.firstPlayer).toBe(first)
      expect(match.phase).toEqual({ kind: 'staging', pending: [first, first === 0 ? 1 : 0] })
      expect(match.turn.player).toBe(first)
      expect(match.log.some((entry) => entry.kind === 'coinFlip')).toBe(false)
    }
    const flipped = createMatch(starterConfig(), 7)
    expect(flipped.log.some((entry) => entry.kind === 'coinFlip')).toBe(true)
  })
})
