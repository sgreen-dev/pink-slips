import { describe, expect, it } from 'vitest'
import { createMatch, legalActions } from './match.ts'
import { HIDDEN_CARD, redact } from './redact.ts'
import { playOutRandomly, starterConfig } from './test-helpers.ts'
import type { MatchState, PlayerIndex } from './types.ts'

/** Every state along a random play-out, so views are checked mid-match and not only at the end. */
function statesAlong(seed: number): MatchState[] {
  const states: MatchState[] = []
  let state = createMatch(starterConfig(seed % 3, (seed + 1) % 3), seed)
  states.push(state)
  for (let i = 0; i < 400; i++) {
    const next = playOutRandomly(state, seed + i, 1)
    if (next === state) break
    states.push(next)
    state = next
  }
  return states
}

describe('redact', () => {
  it('never shows the opponent hand or either deck order, across played-out matches', () => {
    for (let seed = 1; seed <= 12; seed++) {
      for (const state of statesAlong(seed)) {
        for (const viewer of [0, 1] as const) {
          const opponent: PlayerIndex = viewer === 0 ? 1 : 0
          const view = redact(state, viewer)
          const theirs = view.players[opponent]
          const real = state.players[opponent]
          expect(theirs.hand).toHaveLength(real.hand.length)
          expect(theirs.hand.every((id) => id === HIDDEN_CARD)).toBe(true)
          expect(theirs.deck).toHaveLength(real.deck.length)
          expect(theirs.deck.every((id) => id === HIDDEN_CARD)).toBe(true)
          const mine = view.players[viewer]
          expect(mine.hand).toEqual(state.players[viewer].hand)
          expect([...mine.deck]).toEqual([...state.players[viewer].deck].sort())
          expect(view.rng).toBe(0)
          expect(JSON.stringify(view.log)).not.toContain(HIDDEN_CARD)
        }
      }
    }
  })

  it('keeps everything on the table as it is', () => {
    const state = playOutRandomly(createMatch(starterConfig(), 5), 5, 60)
    const view = redact(state, 0)
    for (const seat of [0, 1] as const) {
      const real = state.players[seat]
      const shown = view.players[seat]
      expect(shown.garage).toEqual(real.garage)
      expect(shown.stagedCarId).toBe(real.stagedCarId)
      expect(shown.discard).toEqual(real.discard)
      expect(shown.pinkSlips).toEqual(real.pinkSlips)
      expect(shown.pendingSabotage).toEqual(real.pendingSabotage)
    }
    expect(view.race).toEqual(state.race)
    expect(view.turn).toEqual(state.turn)
    expect(view.phase).toEqual(state.phase)
  })

  it('gives the viewer the same legal actions from a view as from the full state', () => {
    for (let seed = 20; seed < 26; seed++) {
      for (const state of statesAlong(seed)) {
        for (const viewer of [0, 1] as const) {
          // The same set; the order can differ because sponsors are listed in deck order.
          const asSet = (s: MatchState) =>
            legalActions(s, viewer)
              .map((action) => JSON.stringify(action))
              .sort()
          expect(asSet(redact(state, viewer))).toEqual(asSet(state))
        }
      }
    }
  })
})
