import { describe, expect, it } from 'vitest'
import { createMatch, redact } from '../engine/index.ts'
import { starterConfig } from '../engine/test-helpers.ts'
import { STARTERS } from '../data/starters.ts'
import { parseClientMessage, parseServerMessage } from './messages.ts'

const garage = { garage: STARTERS[0]?.cars ?? [], deck: STARTERS[0]?.deck ?? [] }

describe('stakes on the wire', () => {
  it('reads the join flag only when it is a boolean, and keeps it only when true', () => {
    const on = parseClientMessage(
      JSON.stringify({ type: 'join', name: 'Ann', garage, stakes: true }),
    )
    expect(on).toMatchObject({ type: 'join', stakes: true })
    const off = parseClientMessage(
      JSON.stringify({ type: 'join', name: 'Ann', garage, stakes: false }),
    )
    expect(off).toEqual({ type: 'join', name: 'Ann', garage })
    expect(
      parseClientMessage(JSON.stringify({ type: 'join', name: 'Ann', garage, stakes: 'yes' })),
    ).toBeNull()
  })

  it('reads a result with or without a transfer', () => {
    const plain = parseServerMessage(
      JSON.stringify({ type: 'result', packsEarned: 1, rating: null }),
    )
    expect(plain).toEqual({ type: 'result', packsEarned: 1, rating: null, stakes: null })
    const transfer = { gained: ['bugatti-chiron'], lost: [] }
    const withStakes = parseServerMessage(
      JSON.stringify({ type: 'result', packsEarned: 1, rating: null, stakes: transfer }),
    )
    expect(withStakes).toEqual({ type: 'result', packsEarned: 1, rating: null, stakes: transfer })
    expect(
      parseServerMessage(
        JSON.stringify({ type: 'result', packsEarned: 1, rating: null, stakes: { gained: 'x' } }),
      ),
    ).toBeNull()
  })
})

describe('the turn clock on the wire', () => {
  // A real redacted view: the shape is checked now, so any old object is refused.
  const base = {
    type: 'state',
    view: redact(createMatch(starterConfig(), 3), 0),
    names: ['Ann', 'Bo'],
    plates: [0, 0],
  }

  it('refuses a view that is not one, rather than casting it at the board', () => {
    expect(parseServerMessage(JSON.stringify({ ...base, view: {} }))).toBeNull()
    expect(parseServerMessage(JSON.stringify({ ...base, view: { any: 'shape' } }))).toBeNull()
    expect(
      parseServerMessage(JSON.stringify({ ...base, view: { ...base.view, players: [] } })),
    ).toBeNull()
    expect(
      parseServerMessage(JSON.stringify({ ...base, view: { ...base.view, rng: 7 } })),
    ).toBeNull()
    expect(parseServerMessage(JSON.stringify(base))).not.toBeNull()
  })

  it('refuses a view whose phase or turn step the engine does not know (backlog Q50)', () => {
    const view = base.view
    const frame = (patch: object) => JSON.stringify({ ...base, view: { ...view, ...patch } })
    expect(parseServerMessage(frame({ turn: { ...view.turn, step: 'dance' } }))).toBeNull()
    expect(parseServerMessage(frame({ turn: { player: 0 } }))).toBeNull()
    expect(parseServerMessage(frame({ phase: { kind: 'intermission' } }))).toBeNull()
    expect(parseServerMessage(frame({ phase: { kind: 'staging' } }))).toBeNull()
    expect(parseServerMessage(frame({ phase: { kind: 'over', winner: 2 } }))).toBeNull()
    // Every kind the engine does know still parses.
    expect(parseServerMessage(frame({ phase: { kind: 'turn' } }))).not.toBeNull()
    expect(parseServerMessage(frame({ phase: { kind: 'over', winner: 1 } }))).not.toBeNull()
    const choice = { kind: 'choice', player: 0, choice: { kind: 'discardPart', carId: 'x' } }
    expect(parseServerMessage(frame({ phase: choice }))).not.toBeNull()
  })

  it('reads a remainder when the room sends one', () => {
    expect(parseServerMessage(JSON.stringify({ ...base, turnMsLeft: 42_000 }))).toMatchObject({
      type: 'state',
      turnMsLeft: 42_000,
    })
    expect(parseServerMessage(JSON.stringify({ ...base, turnMsLeft: 0 }))).toMatchObject({
      turnMsLeft: 0,
    })
  })

  it('defaults to no clock, so a room that does not send one still parses', () => {
    expect(parseServerMessage(JSON.stringify(base))).toMatchObject({
      type: 'state',
      turnMsLeft: null,
    })
    for (const bad of [-1, 'soon', null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        parseServerMessage(JSON.stringify({ ...base, turnMsLeft: bad })),
        String(bad),
      ).toMatchObject({ turnMsLeft: null })
    }
  })
})
