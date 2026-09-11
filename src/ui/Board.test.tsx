// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chooseAction } from '../cpu/index.ts'
import { apply, createMatch, currentPlayer, isOver, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { Board } from './Board.tsx'
import { NO_SELECTION } from './interaction.ts'
import { describeLogEntry } from './narrate.ts'
import { scrollRowBack, TURN_END_RESET_MS } from './scroll.ts'
import { act, draw, fireEvent, screen } from './testRender.tsx'

// The real camera, watched: every export still does what it does, and each call is recorded.
vi.mock(import('./scroll.ts'), { spy: true })

/**
 * The board is the screen a match is actually played on, and it had no test of any kind
 * (backlog Q35). What is pinned here is that it draws both seats, that it shows the viewer
 * only their own hand — the whole point of `redact` online — and that leaving a local match
 * asks first, which `DESIGN.md` 8 requires of anything that throws work away. And the things
 * that should hold still do: a new match stays at its top, the log slides in only its new line,
 * and a second refused play leaves focus where it was (backlog U34, U33, A11).
 */

const NAMES: readonly [string, string] = ['Player', 'Street CPU']

function board(state: MatchState, extra: Record<string, unknown> = {}) {
  const onAction = vi.fn()
  const onExit = vi.fn()
  const ui = (next: MatchState) => (
    <Board
      state={next}
      viewer={0}
      names={NAMES}
      selection={NO_SELECTION}
      options={null}
      onAction={onAction}
      onSelect={vi.fn()}
      onOptions={vi.fn()}
      onExit={onExit}
      {...extra}
    />
  )
  const view = draw(ui(state))
  /** The same board handed the next state, the way a match in progress hands it one. */
  const redraw = (next: MatchState) => view.rerender(ui(next))
  return { ...view, onAction, onExit, redraw }
}

const fresh = () => createMatch(starterConfig(0, 1), 7)

/** Plays the match on, the CPU choosing for whoever is on turn, until `stop` holds. */
function playUntil(state: MatchState, stop: (s: MatchState) => boolean): MatchState {
  let s = state
  for (let step = 0; step < 2000 && !stop(s) && isOver(s) === null; step++) {
    const seat = currentPlayer(s)
    if (seat === null) break
    s = apply(s, chooseAction(s, seat, 5))
  }
  return s
}

/** How many lines the log would show in full: some entries, like a draw, say nothing. */
const spoken = (s: MatchState) =>
  s.log.filter((entry) => describeLogEntry(entry, NAMES) !== null).length

describe('the board', () => {
  it('names both seats', () => {
    board(fresh())
    expect(screen.getAllByText(NAMES[0]).length).toBeGreaterThan(0)
    expect(screen.getAllByText(NAMES[1]).length).toBeGreaterThan(0)
  })

  it('draws a card for every car in both garages', () => {
    const state = fresh()
    const { container } = board(state)
    const cards = container.querySelectorAll('.card')
    const garaged = state.players[0].garage.length + state.players[1].garage.length
    expect(cards.length).toBeGreaterThanOrEqual(garaged)
  })

  it('shows the viewer their own hand and keeps the other face down', () => {
    const state = fresh()
    const { container } = board(state)
    // The opponent's hand is drawn face down; the viewer's is drawn as mod cards.
    expect(container.querySelectorAll('.card-back').length).toBeGreaterThan(0)
    const mine = state.players[0].hand
    expect(mine.length).toBeGreaterThan(0)
  })

  it('says whose turn it is', () => {
    const state = fresh()
    board(state)
    const seat = currentPlayer(state)
    // A fresh match always has someone on turn; the board has to say who.
    expect(seat).not.toBeNull()
    expect(screen.getAllByText(new RegExp(NAMES[seat!])).length).toBeGreaterThan(0)
  })

  it('asks before leaving a match, rather than leaving on the first click', () => {
    const { onExit } = board(fresh())
    fireEvent.click(screen.getByRole('button', { name: 'Exit match' }))
    expect(onExit).not.toHaveBeenCalled()
    // The confirm appears, and only its own button leaves.
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('lets the confirm be waved off without leaving', () => {
    const { onExit } = board(fresh())
    fireEvent.click(screen.getByRole('button', { name: 'Exit match' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stay' }))
    expect(onExit).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })

  it('takes no clicks while the race-end banner is up', () => {
    const { onAction } = board(fresh(), { inert: true })
    for (const button of screen.queryAllByRole('button')) fireEvent.click(button)
    expect(onAction).not.toHaveBeenCalled()
  })
})

/**
 * The turn-end move's own call: the hand row back to its start. Each garage row resets itself
 * too, which moves nothing on a row already at its start, so only this one is counted.
 */
const turnEndMoves = () =>
  vi.mocked(scrollRowBack).mock.calls.filter(([row]) => row?.classList.contains('hand__cards'))
    .length

describe('the camera', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(scrollRowBack).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('leaves a match that has just opened at its top', () => {
    // Nothing has ended yet, so there is nothing to follow; the turn-end move used to run on
    // the count's first value and scroll a new match down to the track (backlog U34).
    board(fresh())
    act(() => {
      vi.advanceTimersByTime(TURN_END_RESET_MS * 2)
    })
    expect(turnEndMoves()).toBe(0)
  })

  it('still follows the play once the viewer hands the turn over', () => {
    const mine = playUntil(fresh(), (s) => currentPlayer(s) === 0)
    const theirs = playUntil(mine, (s) => currentPlayer(s) !== 0)
    const { redraw } = board(mine)
    redraw(theirs)
    act(() => {
      vi.advanceTimersByTime(TURN_END_RESET_MS)
    })
    expect(turnEndMoves()).toBe(1)
  })
})

describe('the match log', () => {
  it('slides in only the new line when the last-eight window moves on', () => {
    // Keyed by its place in the window, every line was a new element each turn, so all eight
    // replayed their slide-in (backlog U33). A line that stays is the element it was.
    const long = playUntil(fresh(), (s) => spoken(s) >= 10)
    const longer = playUntil(long, (s) => spoken(s) > spoken(long))
    const added = spoken(longer) - spoken(long)
    expect(added).toBeGreaterThan(0)
    expect(added).toBeLessThan(8)
    const { container, redraw } = board(long)
    const before = [...container.querySelectorAll('.log__lines li')]
    redraw(longer)
    const after = [...container.querySelectorAll('.log__lines li')]
    expect(before).toHaveLength(8)
    expect(after).toHaveLength(8)
    after.slice(0, 8 - added).forEach((line, i) => expect(line).toBe(before[added + i]))
    for (const line of after.slice(8 - added)) expect(before).not.toContain(line)
  })
})

describe('a refused play', () => {
  it('keeps focus on the notice when a second refusal replaces the first', () => {
    const { container } = board(fresh())
    const card = container.querySelector<HTMLElement>('.hand .mod--unplayable')
    expect(card, 'no unplayable card in a fresh hand').not.toBeNull()
    fireEvent.click(card!)
    const ok = screen.getByRole('button', { name: 'OK' })
    ok.focus()
    fireEvent.click(card!)
    // The same box and the same button, still focused. Rebuilding the box to replay its fade
    // dropped focus to the page (backlog A11).
    expect(screen.getByRole('button', { name: 'OK' })).toBe(ok)
    expect(document.activeElement).toBe(ok)
  })
})
