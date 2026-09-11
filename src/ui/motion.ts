/**
 * Whether the player has asked for less motion.
 *
 * Its own module because two things read it and they are otherwise unrelated: `useEasedNumber`,
 * which skips its frame loop, and `useTilt`, which refuses to lean a card. `matchMedia` is
 * guarded because the tests run in an environment that does not always have it, and a missing
 * one is not a preference for motion.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
