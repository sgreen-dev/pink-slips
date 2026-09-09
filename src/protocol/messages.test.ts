import { describe, expect, it } from 'vitest'
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
  const base = { type: 'state', view: { any: 'shape' }, names: ['Ann', 'Bo'], plates: [0, 0] }

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
