import { describe, expect, it } from 'vitest'
import { apply, createMatch, isOver } from './match.ts'
import {
  deepFreeze,
  pendingActions,
  playOut,
  playOutRandomly,
  starterConfig,
} from './test-helpers.ts'
import { TUNABLES } from './tunables.ts'

describe('a full match', () => {
  it('runs to a winner between two mod-less garages under a fixed seed', () => {
    const final = playOut(createMatch(starterConfig(0, 1), 1))
    const winner = isOver(final)
    expect(winner).not.toBeNull()
    if (winner === null) return
    expect(final.players[winner].pinkSlips).toHaveLength(TUNABLES.pinkSlipsToWin)
    expect(final.turn.number).toBeLessThan(200)
  })

  it('runs to a winner for every starter pairing and many seeds with random legal play', () => {
    const pairings: Array<[number, number]> = [
      [0, 1],
      [1, 2],
      [2, 0],
      [0, 0],
    ]
    for (const [a, b] of pairings) {
      for (let seed = 1; seed <= 25; seed++) {
        const final = playOutRandomly(createMatch(starterConfig(a, b), seed), seed * 7919, 50000)
        expect(isOver(final), `pairing ${a} v ${b}, seed ${seed}`).not.toBeNull()
      }
    }
  })

  it('produces the same match for the same seed', () => {
    const a = playOut(createMatch(starterConfig(), 123))
    const b = playOut(createMatch(starterConfig(), 123))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))

    const c = playOut(createMatch(starterConfig(), 124))
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a))
  })

  it('apply never mutates its input', () => {
    let state = deepFreeze(createMatch(starterConfig(), 5))
    for (let i = 0; i < 500 && isOver(state) === null; i++) {
      const action = pendingActions(state)[0]
      if (!action) throw new Error('no action')
      const snapshot = JSON.stringify(state)
      const next = apply(state, action)
      expect(JSON.stringify(state)).toBe(snapshot)
      expect(next).not.toBe(state)
      state = deepFreeze(next)
    }
    expect(isOver(state)).not.toBeNull()
  })

  it('createMatch never mutates its config', () => {
    const config = deepFreeze(starterConfig())
    expect(() => createMatch(config, 1)).not.toThrow()
  })
})
