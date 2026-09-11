import { describe, expect, it } from 'vitest'
import { STARTERS } from '../data/starters.ts'
import { createMatch, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { copiesOwned } from './collection.ts'
import {
  applyTransfer,
  sanitizeRaced,
  settleStakes,
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
describe('settling stakes', () => {
  const side = (
    owned: Record<string, number>,
    raced: string[] | null,
    chrome: Record<string, number> = {},
  ) => ({ owned, chrome, raced })
  /** Both sides' transfers when the winner took `won` and the loser took `lost`. */
  const took = (won: string[], lost: string[]) => ({
    winner: { gained: won, lost },
    loser: { gained: lost, lost: won },
  })

  it('moves every captured car between two sides that own what they raced', () => {
    const settled = settleStakes(took([F40], [DB5]), {
      winner: side({ [DB5]: 1, [Z]: 1 }, [DB5, Z]),
      loser: side({ [F40]: 1, [CHIRON]: 1 }, [F40, CHIRON]),
    })
    expect(settled).toEqual(took([F40], [DB5]))
  })

  it('keeps a keepsake with whoever holds it, the winner as much as the loser', () => {
    // Each side took the other's keepsake. The loser's always stayed put; the winner's stayed in
    // the winner's collection and went to the loser as well (backlog S23).
    const settled = settleStakes(took([F40], [DB5]), {
      winner: side({ [DB5]: 1 }, [DB5], { [DB5]: 1 }),
      loser: side({ [F40]: 1 }, [F40], { [F40]: 1 }),
    })
    expect(settled).toEqual(took([], []))
    // The collection step refuses a keepsake too, as a second guard.
    expect(applyTransfer({ x: 1, y: 1 }, { gained: [], lost: ['x', 'y'] }, { x: 1 })).toEqual({
      x: 1,
      y: 0,
    })
  })

  it('moves a car out of a collection no more often than it holds one', () => {
    const settled = settleStakes(took([F40, F40], []), {
      winner: side({}, []),
      loser: side({ [F40]: 1 }, [F40]),
    })
    expect(settled).toEqual(took([F40], []))
  })

  it('gives nothing to a side that raced a car it does not own, and still takes what it staked', () => {
    // A client written for the purpose can race cars it never opened (backlog S16). This winner
    // raced a Chiron it does not hold beside an F40 it does, and lost the F40 along the way.
    const settled = settleStakes(took([DB5], [F40]), {
      winner: side({ [F40]: 1 }, [CHIRON, F40]),
      loser: side({ [DB5]: 1 }, [DB5]),
    })
    expect(settled).toEqual({
      winner: { gained: [], lost: [F40] },
      loser: { gained: [F40], lost: [] },
    })
  })

  it('does not count a loaner car against a garage, since nobody owns one', () => {
    const settled = settleStakes(took([DB5], []), {
      winner: side({}, [STARTER]),
      loser: side({ [DB5]: 1 }, [DB5]),
    })
    expect(settled).toEqual(took([DB5], []))
  })

  it('moves nothing when the room did not say what was raced', () => {
    const settled = settleStakes(took([DB5], [F40]), {
      winner: side({ [F40]: 1 }, null),
      loser: side({ [DB5]: 1 }, null),
    })
    expect(settled).toEqual(took([], []))
  })

  it('reads the raced garages from the wire only as two lists of strings', () => {
    expect(sanitizeRaced({ winner: [F40], loser: [] })).toEqual({ winner: [F40], loser: [] })
    expect(sanitizeRaced({ winner: [F40] })).toBeNull()
    expect(sanitizeRaced({ winner: [1], loser: [] })).toBeNull()
    expect(sanitizeRaced(null)).toBeNull()
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
