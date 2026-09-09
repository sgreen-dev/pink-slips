import { describe, expect, it } from 'vitest'
import { STARTERS } from '../data/starters.ts'
import { createMatch, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { copiesOwned } from './collection.ts'
import {
  applyTransfer,
  protectKeepsakes,
  carNames,
  isEmptyTransfer,
  isStakedCar,
  sanitizeTransfer,
  stakesAllowed,
  stakesTransfer,
  LOANER_CAR_IDS,
} from './stakes.ts'

const CHIRON = 'bugatti-chiron'
const F40 = 'ferrari-f40'
const DB5 = 'aston-martin-db5'
const Z = 'nissan-350z'
const STARTER = STARTERS[0]?.cars[0] ?? ''

function withSlips(first: string[], second: string[]): MatchState {
  const state = createMatch(starterConfig(), 1)
  return {
    ...state,
    players: [
      { ...state.players[0], pinkSlips: first },
      { ...state.players[1], pinkSlips: second },
    ],
  }
}

describe('stakes', () => {
  it('lets each seat keep what it took and lose what the other took, whoever won', () => {
    const [first, second] = stakesTransfer(withSlips([CHIRON, F40], [DB5]))
    expect(first).toEqual({ gained: [CHIRON, F40], lost: [DB5] })
    expect(second).toEqual({ gained: [DB5], lost: [CHIRON, F40] })
  })

  it('never moves a starter car', () => {
    expect(STARTER).not.toBe('')
    expect(LOANER_CAR_IDS.has(STARTER)).toBe(true)
    expect(isStakedCar(STARTER)).toBe(false)
    expect(isStakedCar(CHIRON)).toBe(true)
    const [first, second] = stakesTransfer(withSlips([STARTER, CHIRON], [STARTER]))
    expect(first).toEqual({ gained: [CHIRON], lost: [] })
    expect(second).toEqual({ gained: [], lost: [CHIRON] })
    for (const starter of STARTERS) {
      for (const car of starter.cars) expect(LOANER_CAR_IDS.has(car), car).toBe(true)
    }
  })

  it('adds a copy for a gain and takes one for a loss, never below zero', () => {
    const before = { [CHIRON]: 1, [F40]: 2 }
    const after = applyTransfer(before, { gained: [DB5, DB5], lost: [CHIRON, F40, Z] })
    expect(copiesOwned(after, DB5)).toBe(2)
    expect(copiesOwned(after, CHIRON)).toBe(0)
    expect(copiesOwned(after, F40)).toBe(1)
    expect(copiesOwned(after, Z)).toBe(0)
    expect(before[CHIRON]).toBe(1)
  })

  it('accepts only lists of car ids from the wire, drops starters, and caps the lists', () => {
    expect(sanitizeTransfer(null)).toBeNull()
    expect(sanitizeTransfer({ gained: 'x', lost: [] })).toBeNull()
    expect(sanitizeTransfer({ gained: [1], lost: [] })).toBeNull()
    expect(sanitizeTransfer({ gained: [CHIRON, STARTER, 'no-such-car'], lost: [] })).toEqual({
      gained: [CHIRON],
      lost: [],
    })
    const many = sanitizeTransfer({ gained: [], lost: [CHIRON, F40, DB5, Z, CHIRON] })
    expect(many?.lost).toHaveLength(3)
  })

  it('names cars for a result line', () => {
    expect(isEmptyTransfer({ gained: [], lost: [] })).toBe(true)
    expect(carNames([CHIRON])).toBe('Bugatti Chiron')
    expect(carNames([CHIRON, F40])).toBe('Bugatti Chiron and Ferrari F40')
    expect(carNames([CHIRON, F40, DB5])).toBe('Bugatti Chiron, Ferrari F40 and Aston Martin DB5')
  })
})
describe('keepsakes under stakes', () => {
  it('never change hands, on either side', () => {
    const transfers = {
      winner: { gained: ['x', 'y'], lost: [] },
      loser: { gained: [], lost: ['x', 'y'] },
    }
    expect(protectKeepsakes(transfers, { x: 1 })).toEqual({
      winner: { gained: ['y'], lost: [] },
      loser: { gained: [], lost: ['y'] },
    })
    expect(applyTransfer({ x: 1, y: 1 }, { gained: [], lost: ['x', 'y'] }, { x: 1 })).toEqual({
      x: 1,
      y: 0,
    })
  })
})

describe('when a match can be played for stakes (DESIGN.md 12)', () => {
  const cpu = {
    mode: 'cpu',
    level: 'street',
    cpuGarageIsOwn: false,
    randomGarages: false,
  } as const

  it('allows a Street or Pro CPU racing a loaner', () => {
    expect(stakesAllowed(cpu)).toBe(true)
    expect(stakesAllowed({ ...cpu, level: 'pro' })).toBe(true)
  })

  it('refuses hotseat, where both players share one collection', () => {
    expect(stakesAllowed({ ...cpu, mode: 'hotseat' })).toBe(false)
  })

  it('refuses Rookie, which can be farmed', () => {
    expect(stakesAllowed({ ...cpu, level: 'rookie' })).toBe(false)
  })

  // A garage of your own on the CPU side stakes a collection against itself: every car it can
  // lose is one you already hold, so a win only ever adds a duplicate to scrap.
  it('refuses a CPU garage the player built from cards they own', () => {
    expect(stakesAllowed({ ...cpu, cpuGarageIsOwn: true })).toBe(false)
    expect(stakesAllowed({ ...cpu, level: 'pro', cpuGarageIsOwn: true })).toBe(false)
  })

  // A dealt garage is not owned, so its cars can be neither won nor lost, exactly as a loaner
  // car cannot. Without this a win would write cars into a collection that never opened them.
  it('refuses a garage the game dealt, at every level', () => {
    expect(stakesAllowed({ ...cpu, randomGarages: true })).toBe(false)
    expect(stakesAllowed({ ...cpu, level: 'pro', randomGarages: true })).toBe(false)
    expect(stakesAllowed({ ...cpu, level: 'rookie', randomGarages: true })).toBe(false)
    // And it is refused on its own, not only alongside the other reasons.
    expect(stakesAllowed({ ...cpu })).toBe(true)
  })
})
