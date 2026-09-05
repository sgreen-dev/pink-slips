import { describe, expect, it } from 'vitest'
import { STARTERS } from '../data/starters.ts'
import { createMatch, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { copiesOwned } from './collection.ts'
import {
  applyTransfer,
  carNames,
  isEmptyTransfer,
  isStakedCar,
  sanitizeTransfer,
  stakesTransfer,
  STARTER_CAR_IDS,
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
    expect(STARTER_CAR_IDS.has(STARTER)).toBe(true)
    expect(isStakedCar(STARTER)).toBe(false)
    expect(isStakedCar(CHIRON)).toBe(true)
    const [first, second] = stakesTransfer(withSlips([STARTER, CHIRON], [STARTER]))
    expect(first).toEqual({ gained: [CHIRON], lost: [] })
    expect(second).toEqual({ gained: [], lost: [CHIRON] })
    for (const starter of STARTERS) {
      for (const car of starter.cars) expect(STARTER_CAR_IDS.has(car), car).toBe(true)
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
