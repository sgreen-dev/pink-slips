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
