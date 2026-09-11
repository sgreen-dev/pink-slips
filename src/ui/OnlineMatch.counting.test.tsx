// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatch, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import type { RoomClientHandlers } from './online.ts'
import { OnlineMatch } from './OnlineMatch.tsx'
import { act, draw } from './testRender.tsx'

/**
 * What an online match counts for the owner's stats (backlog Q54): each browser its own start and
 * its own finish. A start is the moment a match begins, so a rematch is one and a refresh that
 * rejoins a match under way is not. The room is the same stand-in `OnlineMatch.test.tsx` uses.
 */

const room = vi.hoisted(() => ({ handlers: null as RoomClientHandlers | null }))
const counted = vi.hoisted(() => vi.fn())

vi.mock(import('./analytics.ts'), async (importOriginal) => ({
  ...(await importOriginal()),
  count: counted,
}))

vi.mock(import('./online.ts'), async (importOriginal) => {
  const real = await importOriginal()
  class StandIn {
    readonly connect = vi.fn()
    readonly close = vi.fn()
    readonly resume = vi.fn()
    readonly join = vi.fn()
    readonly act = vi.fn()
    readonly undo = vi.fn()
    readonly rematch = vi.fn()
    readonly concede = vi.fn()
    constructor(_url: string, handlers: RoomClientHandlers) {
      room.handlers = handlers
    }
  }
  return { ...real, RoomClient: StandIn as unknown as typeof real.RoomClient }
})

const START = createMatch(starterConfig(0, 1), 7)

/** Joins a room as the first seat. */
function join(): void {
  draw(
    <OnlineMatch
      endpoint="http://127.0.0.1:8787"
      entry={{
        code: 'ABCDEF',
        name: 'Ann',
        garage: null,
        token: 'seat-token',
        ticket: null,
        stakes: false,
      }}
      onLeave={vi.fn()}
      onAgain={vi.fn()}
    />,
  )
  act(() => {
    room.handlers?.onStatus('open')
    room.handlers?.onMessage({ type: 'welcome', code: 'ABCDEF', seat: 0, token: 'seat-token' })
  })
}

/** The room sends the match as it stands. */
function show(view: MatchState): void {
  act(() => {
    room.handlers?.onMessage({
      type: 'state',
      view,
      names: ['Ann', 'Bo'],
      plates: [0, 0],
      turnMsLeft: null,
    })
  })
}

function result(): void {
  act(() => {
    room.handlers?.onMessage({ type: 'result', packsEarned: null, rating: null, stakes: null })
  })
}

const times = (name: string) => counted.mock.calls.filter(([event]) => event === name).length

beforeEach(() => {
  counted.mockClear()
})

describe('what an online match counts', () => {
  it('counts a start once, however often the room repeats the opening', () => {
    join()
    show(START)
    show({ ...START })
    expect(times('match-start-online')).toBe(1)
  })

  it('does not count a start when rejoining a match already under way', () => {
    join()
    show({ ...START, race: { ...START.race, number: 2 } })
    expect(times('match-start-online')).toBe(0)
  })

  it('counts a finish once, and the rematch as a new start', () => {
    join()
    show(START)
    show({ ...START, phase: { kind: 'over', winner: 0 } })
    result()
    result()
    expect(times('match-finish-online')).toBe(1)
    show(START)
    expect(times('match-start-online')).toBe(2)
  })
})
