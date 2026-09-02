import { describe, expect, it } from 'vitest'
import { flipCoin, nextFloat, nextInt, seedRng, shuffle } from './rng.ts'

describe('seeded random number generator', () => {
  it('produces the same sequence for the same seed', () => {
    const a = seedRng(42)
    const b = seedRng(42)
    const [x1, a2] = nextFloat(a)
    const [y1, b2] = nextFloat(b)
    const [x2] = nextFloat(a2)
    const [y2] = nextFloat(b2)
    expect(x1).toBe(y1)
    expect(x2).toBe(y2)
    expect(x1).not.toBe(x2)
  })

  it('produces different sequences for different seeds', () => {
    const [x] = nextFloat(seedRng(1))
    const [y] = nextFloat(seedRng(2))
    expect(x).not.toBe(y)
  })

  it('never mutates its input state', () => {
    const state = seedRng(7)
    nextFloat(state)
    nextInt(state, 10)
    flipCoin(state)
    shuffle(state, [1, 2, 3])
    expect(state).toBe(seedRng(7))
  })

  it('keeps floats in [0, 1) and ints in range', () => {
    let rng = seedRng(3)
    for (let i = 0; i < 1000; i++) {
      let f: number
      let n: number
      ;[f, rng] = nextFloat(rng)
      ;[n, rng] = nextInt(rng, 6)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThan(1)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(6)
      expect(Number.isInteger(n)).toBe(true)
    }
  })

  it('flips a fair coin (DESIGN.md 3.6)', () => {
    let rng = seedRng(11)
    let heads = 0
    for (let i = 0; i < 2000; i++) {
      let result: boolean
      ;[result, rng] = flipCoin(rng)
      if (result) heads++
    }
    expect(heads).toBeGreaterThan(900)
    expect(heads).toBeLessThan(1100)
  })

  it('shuffles into a permutation without touching the input', () => {
    const input = Object.freeze([...Array(30).keys()])
    const [shuffled] = shuffle(seedRng(5), input)
    expect(shuffled).not.toEqual(input)
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...input])
  })
})
