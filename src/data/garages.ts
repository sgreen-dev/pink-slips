import { CARS, getCar } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { INTRO_SET, STARTERS } from '../data/starters.ts'
import { CAR_TYPES, TIERS, type Car, type CarType, type Tier } from '../data/types.ts'
import { copyLimit, shuffle, TUNABLES, type PlayerConfig, type RngState } from '../engine/index.ts'

/** Garage generators for the simulator (DESIGN.md section 7). Every pick flows through the rng. */

export type GarageKind =
  'random' | 'single-type' | 'single-tier' | 'starter' | 'intro' | 'same-tiers'

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

/** The tiers every type has cars in, and the cars in them: what a same-tier template draws from. */
const SHARED_TIERS = TIERS.filter((tier) =>
  CAR_TYPES.every((type) => CARS.some((car) => car.type === type && car.tier === tier)),
)
const SHARED_TIER_CARS = CARS.filter((car) => SHARED_TIERS.includes(car.tier))

function carsOf(type: CarType | null, tier: Tier): Car[] {
  return CARS.filter((car) => car.tier === tier && (type === null || car.type === type))
}

/** Whether every type holds enough cars in each tier to fill the template. */
function fitsEveryType(tiers: readonly Tier[]): boolean {
  return CAR_TYPES.every((type) =>
    SHARED_TIERS.every(
      (tier) => tiers.filter((t) => t === tier).length <= carsOf(type, tier).length,
    ),
  )
}

/**
 * Two garages holding the same five tiers, one all of `type` and one of any type: the type lab's
 * reading with the tiers held equal. The tiers come from five cars drawn from the tiers all six
 * types have cars in, so every type can fill the same template. A template asking for more cars of
 * a tier than some type holds (four Rare cars, say, where Off-road has three) is drawn again, for
 * every type alike, so all six are measured over the same templates.
 */
export function sameTierGarages(type: CarType, rng: RngState): [GarageSpec, GarageSpec, RngState] {
  let next = rng
  for (;;) {
    let template: Car[]
    ;[template, next] = pick(SHARED_TIER_CARS, TUNABLES.garageSize, next)
    const tiers = template.map((car) => car.tier)
    if (!fitsEveryType(tiers)) continue
    const subjectCars: Car[] = []
    const otherCars: Car[] = []
    for (const tier of new Set(tiers)) {
      const count = tiers.filter((t) => t === tier).length
      let chosen: Car[]
      ;[chosen, next] = pick(carsOf(type, tier), count, next)
      subjectCars.push(...chosen)
      ;[chosen, next] = pick(carsOf(null, tier), count, next)
      otherCars.push(...chosen)
    }
    let subject: GarageSpec
    let other: GarageSpec
    ;[subject, next] = garageFrom(type, 'same-tiers', subjectCars, next)
    ;[other, next] = garageFrom('same tiers', 'same-tiers', otherCars, next)
    return [subject, other, next]
  }
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
