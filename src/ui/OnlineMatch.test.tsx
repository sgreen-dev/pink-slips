// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatch } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import type { RoomClientHandlers } from './online.ts'
import { OnlineMatch } from './OnlineMatch.tsx'
import { act, draw, fireEvent, within } from './testRender.tsx'

/**
 * The bar over an online match, where leaving concedes (backlog U29). `DESIGN.md` 8 has every
 * destructive pair render the way out and then the confirm, so the spot the arming button held
 * is covered by the way out; here the confirm came first, and a double tap on Leave conceded a
 * ranked match. The room is a stand-in that records what the screen asks of it.
 */

const room = vi.hoisted(() => ({
  handlers: null as RoomClientHandlers | null,
  concede: vi.fn(),
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
    readonly concede = room.concede
    constructor(_url: string, handlers: RoomClientHandlers) {
      room.handlers = handlers
    }
  }
  return { ...real, RoomClient: StandIn as unknown as typeof real.RoomClient }
})

/** A ranked seat with a match under way, and the bar it plays under. */
function seated(): HTMLElement {
  draw(
    <OnlineMatch
      endpoint="http://127.0.0.1:8787"
      entry={{
        code: 'ABCDEF',
        name: 'Ann',
        garage: null,
        token: 'seat-token',
        ticket: 'tk-a',
        stakes: false,
      }}
      onLeave={vi.fn()}
      onAgain={vi.fn()}
    />,
  )
  act(() => {
    room.handlers?.onStatus('open')
    room.handlers?.onMessage({ type: 'welcome', code: 'ABCDEF', seat: 0, token: 'seat-token' })
    room.handlers?.onMessage({
      type: 'state',
      view: createMatch(starterConfig(0, 1), 7),
      names: ['Ann', 'Bo'],
      plates: [0, 0],
      turnMsLeft: null,
    })
  })
  const bar = document.querySelector<HTMLElement>('.online__bar')
  if (!bar) throw new Error('No online bar')
  return bar
}

describe('leaving an online match', () => {
  beforeEach(() => {
    room.concede.mockClear()
  })

  it('puts the way out where Leave stood, so a double tap does not concede', () => {
    const bar = seated()
    const leave = within(bar).getByRole('button', { name: 'Leave' })
    const spot = within(bar).getAllByRole('button').indexOf(leave)
    fireEvent.click(leave)
    const second = within(bar).getAllByRole('button')[spot]
    expect(second?.textContent).toBe('Stay')
    // The second tap of a double tap lands here, and the match goes on.
    if (second) fireEvent.click(second)
    expect(room.concede).not.toHaveBeenCalled()
    expect(within(bar).getByRole('button', { name: 'Leave' })).toBeTruthy()
  })

  it('concedes from the confirm and nowhere else', () => {
    const bar = seated()
    fireEvent.click(within(bar).getByRole('button', { name: 'Leave' }))
    fireEvent.click(within(bar).getByRole('button', { name: 'Concede' }))
    expect(room.concede).toHaveBeenCalledTimes(1)
  })
})
