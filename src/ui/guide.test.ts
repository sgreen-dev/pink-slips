import { describe, expect, it } from 'vitest'
import { apply, TUNABLES, type MatchState } from '../engine/index.ts'
import { scenario } from '../engine/test-helpers.ts'
import type { RaceEnd } from './celebration.ts'
import {
  GUIDE_KEY,
  guideStep,
  guideSteps,
  guideText,
  guideWordCount,
  loadGuideDone,
  saveGuideDone,
  type GuideStepId,
} from './guide.ts'
import { NO_SELECTION, prompt } from './interaction.ts'
import type { StorageLike } from './storage.ts'

const CIVIC = 'honda-civic-si'
const MUSTANG = 'ford-mustang-gt'
const MIATA = 'mazda-mx-5-miata'
const NAMES = ['Player 1', 'Player 2'] as const

function board(step: 'fuel' | 'mods' | 'advance' = 'mods', turn: 0 | 1 = 0): MatchState {
  return scenario({
    players: [
      {
        cars: [
          { id: CIVIC, fuel: 1 },
          { id: MUSTANG, fuel: 2 },
        ],
      },
      { cars: [{ id: MIATA, fuel: 1 }] },
    ],
    step,
    turn,
  })
}

const mods = board()
/** Both players still to stage, the viewer first. */
const staging: MatchState = {
  ...mods,
  phase: { kind: 'staging', pending: [0, 1] },
  players: [
    { ...mods.players[0], stagedCarId: null },
    { ...mods.players[1], stagedCarId: null },
  ],
}
/** The viewer has staged; the CPU is still to. */
const opponentPending: MatchState = {
  ...mods,
  phase: { kind: 'staging', pending: [1] },
  players: [mods.players[0], { ...mods.players[1], stagedCarId: null }],
}
const RACE_END: RaceEnd = {
  race: 1,
  winner: 0,
  loser: 1,
  winningCarId: CIVIC,
  capturedCarId: MIATA,
  distanceFt: [1320, 400],
  slips: 1,
  matchOver: false,
}

function fakeStore(): StorageLike {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('guided first match', () => {
  const steps = guideSteps()
  const text = guideText(steps)

  it('reads easily from about age nine up', () => {
    const sentences = text
      .split(/[.!?:]\s+|\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const lengths = sentences.map((s) => s.split(/\s+/).length)
    for (const [i, length] of lengths.entries()) {
      expect(length, sentences[i]).toBeLessThanOrEqual(20)
    }
    const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length
    expect(average).toBeLessThanOrEqual(13)
    expect(guideWordCount(steps)).toBeLessThanOrEqual(120)
    for (const step of Object.values(steps)) {
      expect(step.text.length, step.text).toBeLessThanOrEqual(240)
    }
  })

  it('reads its number from the tunables', () => {
    expect(steps.finish.text).toContain(`Collect ${TUNABLES.pinkSlipsToWin} pink slips`)
    const changed = guideSteps({ ...TUNABLES, pinkSlipsToWin: 5 })
    expect(changed.finish.text).toContain('Collect 5 pink slips')
  })

  it('uses the words the board prompts use', () => {
    const shares = (state: MatchState, step: GuideStepId, phrase: string) => {
      const lower = phrase.toLowerCase()
      expect(prompt(state, 0, NO_SELECTION, NAMES).toLowerCase(), phrase).toContain(lower)
      expect(steps[step].text.toLowerCase(), phrase).toContain(lower)
    }
    shares(staging, 'stage', 'Stage a car')
    shares(board('fuel'), 'fuel', 'Place a fuel token')
    shares(mods, 'mods', 'mod step')
    shares(board('advance'), 'advance', 'Your car is fueled')
    shares(board('advance'), 'advance', 'Advance')
  })

  it('explains a term before it leans on it', () => {
    const at = (needle: string) => {
      const index = text.indexOf(needle)
      expect(index, needle).toBeGreaterThanOrEqual(0)
      return index
    }
    expect(at('Stage a car')).toBeLessThan(at('staged car'))
    expect(at('as a pink slip')).toBeLessThan(at('pink slips and you win'))
  })

  it('points at one thing at a time from the board state', () => {
    expect(guideStep(staging, 0, null, false)).toBe('stage')
    expect(guideStep(opponentPending, 0, null, false)).toBeNull()
    expect(guideStep(board('fuel'), 0, null, false)).toBe('fuel')
    expect(guideStep(mods, 0, null, false)).toBe('mods')
    expect(guideStep(board('advance'), 0, null, false)).toBe('advance')
    // The CPU's turn, a selection in progress, a choice a card forced, and a finished match.
    expect(guideStep(board('mods', 1), 0, null, false)).toBeNull()
    expect(guideStep(mods, 0, null, true)).toBeNull()
    const thief = scenario({
      players: [
        { cars: [{ id: CIVIC, fuel: 1 }], hand: ['parts-thief'] },
        { cars: [{ id: MIATA, fuel: 1, parts: ['turbo-kit', 'aero-package'] }] },
      ],
    })
    const paused = apply(thief, { type: 'playSabotage', player: 0, modId: 'parts-thief' })
    expect(guideStep(paused, 0, null, false)).toBeNull()
    expect(guideStep(paused, 1, null, false)).toBeNull()
    const over: MatchState = { ...mods, phase: { kind: 'over', winner: 0 } }
    expect(guideStep(over, 0, null, false)).toBeNull()
    // A held race end is the finish step whatever else is going on.
    expect(guideStep(mods, 0, RACE_END, false)).toBe('finish')
    expect(guideStep(mods, 0, RACE_END, true)).toBe('finish')
  })

  it('remembers that the guide finished', () => {
    const store = fakeStore()
    expect(loadGuideDone(store)).toBe(false)
    expect(saveGuideDone(store)).toBe(true)
    expect(loadGuideDone(store)).toBe(true)
    store.setItem(GUIDE_KEY, '{"done":"yes"}')
    expect(loadGuideDone(store)).toBe(false)
    store.setItem(GUIDE_KEY, 'garbage')
    expect(loadGuideDone(store)).toBe(false)
    expect(loadGuideDone(null)).toBe(false)
    expect(saveGuideDone(null)).toBe(false)
  })
})
