/**
 * Seeded random number generator. The state is a single 32-bit integer that lives inside
 * MatchState, so every engine function stays pure: each call returns the value and the next
 * state instead of mutating anything. The generator is mulberry32.
 */
export type RngState = number

export function seedRng(seed: number): RngState {
  return seed >>> 0
}

/** Returns a uniform 32-bit unsigned integer and the next state. */
export function nextUint32(state: RngState): [number, RngState] {
  const next = (state + 0x6d2b79f5) >>> 0
  let t = next
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [(t ^ (t >>> 14)) >>> 0, next]
}

/** Returns a float in [0, 1) and the next state. */
export function nextFloat(state: RngState): [number, RngState] {
  const [value, next] = nextUint32(state)
  return [value / 4294967296, next]
}

/** Returns an integer in [0, maxExclusive) and the next state. */
export function nextInt(state: RngState, maxExclusive: number): [number, RngState] {
  const [value, next] = nextFloat(state)
  return [Math.floor(value * maxExclusive), next]
}

/** A 50/50 coin flip (DESIGN.md 3.6). True is heads. */
export function flipCoin(state: RngState): [boolean, RngState] {
  const [value, next] = nextUint32(state)
  return [value >>> 31 === 1, next]
}

/** Fisher-Yates shuffle. Returns a new array and the next state; the input is untouched. */
export function shuffle<T>(state: RngState, items: readonly T[]): [T[], RngState] {
  const result = [...items]
  let rng = state
  for (let i = result.length - 1; i > 0; i--) {
    let j: number
    ;[j, rng] = nextInt(rng, i + 1)
    const a = result[i]
    const b = result[j]
    if (a !== undefined && b !== undefined) {
      result[i] = b
      result[j] = a
    }
  }
  return [result, rng]
}
