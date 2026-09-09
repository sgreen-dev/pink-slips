/**
 * Seeded random number generator. The state lives inside MatchState, so every engine function
 * stays pure: each call returns the value and the next state instead of mutating anything.
 *
 * The generator is xoshiro128**, whose state is four 32-bit words. The width is the point. A
 * player sees their own opening hand, which is the front of a shuffle of a deck they chose, so
 * a narrow state can be searched offline until it reproduces that hand and then run forward to
 * read the opponent's deck and every coin flip left in the match. Online play redacts the state
 * (DESIGN.md 13) and that redaction is only worth the size of what it hides: 128 bits puts the
 * search out of reach, where the 32-bit state it replaced did not.
 *
 * Four words rather than a BigInt so the state is plain JSON, which is what the room stores and
 * what travels to each seat.
 */
export type RngState = readonly [number, number, number, number]

/** The state a redacted view carries: no information, and the right shape (DESIGN.md 13). */
export const ZERO_RNG: RngState = [0, 0, 0, 0]

/**
 * Expands a number into a full state with splitmix32, so `seedRng(1)` still names one run and
 * the simulator and the tests stay reproducible. A seed given this way is only as unguessable
 * as the number behind it, which is why a real match is seeded from `randomRngState` instead.
 */
export function seedRng(seed: number): RngState {
  let z = seed >>> 0
  const word = (): number => {
    z = (z + 0x9e3779b9) >>> 0
    let t = z
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad)
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97)
    return (t ^ (t >>> 15)) >>> 0
  }
  // A state of all zeroes has no successor, so a zero seed is nudged rather than trusted.
  const state: [number, number, number, number] = [word(), word(), word(), word()]
  return state.some((w) => w !== 0) ? state : [1, 2, 3, 4]
}

/**
 * A state read from a hex string, which is how a real match is seeded: the room is handed
 * platform randomness as hex and turns it into a state here, so the engine itself still calls
 * nothing. Four words are taken from the front; anything short is padded out by splitmix32 so
 * the result is always a usable state rather than a partly zeroed one.
 */
export function rngFromHex(hex: string): RngState {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  const words: number[] = []
  for (let i = 0; i < 4; i++) {
    const part = clean.slice(i * 8, i * 8 + 8)
    words.push(part.length === 8 ? parseInt(part, 16) >>> 0 : 0)
  }
  if (words.every((w) => w === 0)) return seedRng(clean.length)
  return [words[0] ?? 0, words[1] ?? 0, words[2] ?? 0, words[3] ?? 0]
}

/** Returns a uniform 32-bit unsigned integer and the next state. */
export function nextUint32(state: RngState): [number, RngState] {
  const [s0, s1, s2, s3] = state
  const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0
  const value = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0
  const t = (s1 << 9) >>> 0
  let a = s2 ^ s0
  let b = s3 ^ s1
  const n1 = (s1 ^ a) >>> 0
  const n0 = (s0 ^ b) >>> 0
  a = (a ^ t) >>> 0
  b = rotl(b, 11)
  return [value, [n0, n1, a, b]]
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
