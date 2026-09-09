import { getCar } from '../data/cars.ts'
import { randomGarage, type GarageSpec } from '../data/garages.ts'
import { TIER_LABEL } from '../data/tiers.ts'
import { seedRng } from '../engine/index.ts'

/**
 * A garage the game deals rather than one the player built (DESIGN.md 5). The draw is the same
 * one the simulator has always raced, so it is the distribution the balance targets are measured
 * against; a seed names a draw, so the same seed always deals the same cars.
 */

/** One dealt garage per seat, drawn from a single seed so a reroll changes both together. */
export function dealGarages(seed: number): [GarageSpec, GarageSpec] {
  const [first, rng] = randomGarage(seedRng(seed))
  const [second] = randomGarage(rng)
  return [first, second]
}

/** One dealt garage, for a seat that chooses on its own, as an online player does. */
export function dealGarage(seed: number): GarageSpec {
  return randomGarage(seedRng(seed))[0]
}

/**
 * The tiers in a dealt garage, worst first, as "2 Daily, 2 Performance, 1 Hyper". A dealt
 * garage has no name to tell it apart from the last one, so its shape is what the player reads.
 */
export function tierLine(garage: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const id of garage) {
    const tier = getCar(id).tier
    counts.set(tier, (counts.get(tier) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tier, n]) => `${n} ${TIER_LABEL[tier as keyof typeof TIER_LABEL]}`)
    .join(', ')
}
