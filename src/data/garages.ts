import { CARS, getCar } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { INTRO_SET, STARTERS } from '../data/starters.ts'
import type { Car, CarType, Tier } from '../data/types.ts'
import { copyLimit, shuffle, TUNABLES, type PlayerConfig, type RngState } from '../engine/index.ts'

/** Garage generators for the simulator (DESIGN.md section 7). Every pick flows through the rng. */

export type GarageKind = 'random' | 'single-type' | 'single-tier' | 'starter' | 'intro'

export interface GarageSpec extends PlayerConfig {
  name: string
  kind: GarageKind
}

function pick<T>(items: readonly T[], count: number, rng: RngState): [T[], RngState] {
  const [shuffled, next] = shuffle(rng, items)
  return [shuffled.slice(0, count), next]
}

/**
 * A 30-card deck drawn at random from every mod the garage can use, up to each mod's copy limit.
 * Type-locked mods are in the pool only when the garage holds a car of that type.
 */
export function randomDeck(garage: readonly string[], rng: RngState): [string[], RngState] {
  const types = new Set(garage.map((id) => getCar(id).type))
  const pool = MODS.filter((mod) => !mod.typeLock || types.has(mod.typeLock))
  const copies = pool.flatMap((mod) => Array.from({ length: copyLimit(mod.id) }, () => mod.id))
  return pick(copies, TUNABLES.modDeckSize, rng)
}

function garageFrom(
  name: string,
  kind: GarageKind,
  cars: readonly Car[],
  rng: RngState,
): [GarageSpec, RngState] {
  const garage = cars.map((car) => car.id)
  const [deck, next] = randomDeck(garage, rng)
  return [{ name, kind, garage, deck }, next]
}

export function randomGarage(rng: RngState): [GarageSpec, RngState] {
  const [cars, next] = pick(CARS, TUNABLES.garageSize, rng)
  return garageFrom('random', 'random', cars, next)
}

export function singleTypeGarage(type: CarType, rng: RngState): [GarageSpec, RngState] {
  const pool = CARS.filter((car) => car.type === type)
  const [cars, next] = pick(pool, TUNABLES.garageSize, rng)
  return garageFrom(type, 'single-type', cars, next)
}

export function singleTierGarage(tier: Tier, rng: RngState): [GarageSpec, RngState] {
  const pool = CARS.filter((car) => car.tier === tier)
  const [cars, next] = pick(pool, TUNABLES.garageSize, rng)
  return garageFrom(tier, 'single-tier', cars, next)
}

export function starterGarage(index: number): GarageSpec {
  const starter = STARTERS[index]
  if (!starter) throw new Error(`No starter at index ${index}`)
  return { name: starter.name, kind: 'starter', garage: starter.cars, deck: starter.deck }
}

/**
 * A garage built only from the intro set (DESIGN.md 12): five of its six cars and thirty of its
 * thirty-two mod copies, both drawn through the rng, so a run measures the set rather than one
 * hand-picked deck out of it.
 */
export function introGarage(rng: RngState): [GarageSpec, RngState] {
  const [cars, afterCars] = pick(INTRO_SET.cars, TUNABLES.garageSize, rng)
  const copies = INTRO_SET.mods.flatMap(([id, n]) => Array.from({ length: n }, () => id))
  const [deck, next] = pick(copies, TUNABLES.modDeckSize, afterCars)
  return [{ name: 'intro', kind: 'intro', garage: cars, deck }, next]
}
