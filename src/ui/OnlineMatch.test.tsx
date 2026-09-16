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

/** A friend room nobody else has joined yet, on a desktop browser: the link and its button. */
function waiting(): void {
  draw(
    <OnlineMatch
      endpoint="http://127.0.0.1:8787"
      entry={{
        code: 'ABCDEF',
        name: 'Ann',
        garage: null,
        token: null,
        ticket: null,
        stakes: false,
      }}
      onLeave={vi.fn()}
      onAgain={vi.fn()}
    />,
  )
  act(() => room.handlers?.onStatus('open'))
}

/**
 * Sending the room link (backlog U47). When the browser refused the clipboard the button stayed
 * "Copy link", which reads as done, and the friend never got the link.
 */
describe('sending the room link', () => {
  function clipboard(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  }

  it('says the link was copied when it was', async () => {
    const copied: string[] = []
    clipboard(async (text) => void copied.push(text))
    waiting()
    fireEvent.click(document.querySelector<HTMLElement>('.online__actions .button--primary')!)
    await vi.waitFor(() =>
      expect(document.querySelector('.online__actions .button--primary')?.textContent).toBe(
        'Link copied',
      ),
    )
    expect(copied).toHaveLength(1)
    expect(copied[0]).toContain('ABCDEF')
    expect(document.querySelector('.online__error')).toBeNull()
  })

  it('says so when the browser will not copy it, and how to copy it by hand', async () => {
    clipboard(async () => {
      throw new Error('NotAllowedError')
    })
    waiting()
    fireEvent.click(document.querySelector<HTMLElement>('.online__actions .button--primary')!)
    await vi.waitFor(() =>
      expect(document.querySelector('.online__error')?.textContent).toContain(
        'could not be copied',
      ),
    )
    expect(document.querySelector('.online__actions .button--primary')?.textContent).toBe(
      'Copy link',
    )
  })
})
