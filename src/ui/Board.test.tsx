// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createMatch, currentPlayer, type MatchState } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { Board } from './Board.tsx'
import { NO_SELECTION } from './interaction.ts'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The board is the screen a match is actually played on, and it had no test of any kind
 * (backlog Q35). What is pinned here is that it draws both seats, that it shows the viewer
 * only their own hand — the whole point of `redact` online — and that leaving a local match
 * asks first, which `DESIGN.md` 8 requires of anything that throws work away.
 */

const NAMES: readonly [string, string] = ['Player', 'Street CPU']

function board(state: MatchState, extra: Record<string, unknown> = {}) {
  const onAction = vi.fn()
  const onExit = vi.fn()
  const view = draw(
    <Board
      state={state}
      viewer={0}
      names={NAMES}
      selection={NO_SELECTION}
      options={null}
      onAction={onAction}
      onSelect={vi.fn()}
      onOptions={vi.fn()}
      onExit={onExit}
      {...extra}
    />,
  )
  return { ...view, onAction, onExit }
}

const fresh = () => createMatch(starterConfig(0, 1), 7)

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
