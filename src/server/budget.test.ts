import { describe, expect, it } from 'vitest'
import { MESSAGE_BURST, MESSAGE_REFILL_MS, spend, type Budget } from './budget.ts'

describe("a socket's message budget", () => {
  it('lets a full burst through at once, then refuses', () => {
    let budget: Budget | undefined
    for (let i = 0; i < MESSAGE_BURST; i++) {
      const next = spend(budget, 1000)
      expect(next.allowed, `message ${i + 1}`).toBe(true)
      budget = next.budget
    }
    expect(spend(budget, 1000).allowed).toBe(false)
  })

  it('earns one message back each refill, and carries part of one', () => {
    const empty = { left: 0, at: 1000 }
    expect(spend(empty, 1000 + MESSAGE_REFILL_MS - 1).allowed).toBe(false)
    const one = spend(empty, 1000 + MESSAGE_REFILL_MS)
    expect(one).toEqual({ allowed: true, budget: { left: 0, at: 1000 + MESSAGE_REFILL_MS } })
    // Half a refill later there is still nothing, and the other half completes it.
    const half = spend(one.budget, 1000 + MESSAGE_REFILL_MS * 1.5)
    expect(half.allowed).toBe(false)
    expect(spend(half.budget, 1000 + MESSAGE_REFILL_MS * 2).allowed).toBe(true)
  })

  it('never holds more than a burst, however long a socket waits', () => {
    expect(spend({ left: 0, at: 0 }, 1e9).budget.left).toBe(MESSAGE_BURST - 1)
  })

  it('earns nothing from a clock that runs backwards', () => {
    expect(spend({ left: 0, at: 5000 }, 1000).allowed).toBe(false)
  })
})
