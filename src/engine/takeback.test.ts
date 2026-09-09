import { describe, expect, it } from 'vitest'
import { keepsTakeBack, legalActions } from './index.ts'
import { scenario } from './test-helpers.ts'
import type { Action, MatchState } from './types.ts'

/**
 * DESIGN.md 3.2 says a mod can be taken back "until the mod step ends or the player advances,
 * in every mode". Three places used to answer that separately -- the hotseat and CPU screens,
 * the online screens, and the room -- and they drifted: the screens kept the stack through the
 * fuel placement Extra Tank owes and the room did not, so the same match behaved differently
 * against the CPU and online. The rule lives in one place now and this is what it says.
 */
describe('what keeps a mod takeable back (DESIGN.md 3.2)', () => {
  const MIATA = 'mazda-mx-5-miata'
  const GR86 = 'toyota-gr86'
  const inMods = (hand: readonly string[]): MatchState =>
    scenario({
      players: [{ cars: [MIATA, GR86], hand }, { cars: ['porsche-911-carrera-s', 'lotus-emira'] }],
    })

  it('keeps it for every kind of mod play', () => {
    const state = inMods(['turbo-kit', 'power-shift', 'wheelspin'])
    const kinds = ['playPart', 'playBoost', 'playSabotage'] as const
    for (const kind of kinds) {
      const action = legalActions(state, 0).find((a) => a.type === kind)
      if (!action) throw new Error(`no ${kind} available`)
      expect(keepsTakeBack(state, action), kind).toBe(true)
    }
  })

  // Extra Tank owes a fuel placement inside the mod step, and the step has not ended.
  it('keeps it through a fuel placement inside the mod step', () => {
    const state = inMods(['extra-tank'])
    const fuel: Action = { type: 'fuel', player: 0, carId: MIATA }
    expect(keepsTakeBack(state, fuel)).toBe(true)
  })

  it('drops it when the step ends or the turn moves on', () => {
    const state = inMods(['turbo-kit'])
    for (const action of [
      { type: 'endMods', player: 0 },
      { type: 'advance', player: 0 },
    ] as Action[]) {
      expect(keepsTakeBack(state, action), action.type).toBe(false)
    }
  })

  it('drops it outside the mod step altogether', () => {
    const fueling = scenario({
      players: [{ cars: [MIATA, GR86], hand: ['turbo-kit'] }, { cars: ['lotus-emira'] }],
      step: 'fuel',
    })
    const play = { type: 'playPart', player: 0, modId: 'turbo-kit', carId: MIATA } as Action
    expect(keepsTakeBack(fueling, play)).toBe(false)
  })
})
