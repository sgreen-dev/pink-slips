import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import type { Car } from '../data/types.ts'
import { TUNABLES } from './tunables.ts'
import type { CarState, WindowedBonus } from './types.ts'

/**
 * What a car's attached Parts do to it. Parts are static: their effect descriptors are read
 * from the attached cards whenever the engine needs them, never copied into state.
 */

/** Part slots on a car. JDM cars get one more (DESIGN.md 2.3). */
export function partSlots(car: Car): number {
  return car.type === 'jdm' ? TUNABLES.partSlotsJdm : TUNABLES.partSlots
}

/** Copies of a mod one deck may hold: rare mods are capped lower (DESIGN.md 2.5, 3.1). */
export function copyLimit(modId: string): number {
  return getMod(modId).rarity === 'rare' ? TUNABLES.maxCopiesPerRareMod : TUNABLES.maxCopiesPerMod
}

export function openSlots(state: CarState): number {
  return partSlots(getCar(state.carId)) - state.parts.length
}

export interface PartModifiers {
  hpPercent: number
  weightReductionLb: number
  flatBonuses: WindowedBonus[]
  noWearFromWinning: boolean
  tractionImmunity: boolean
}

export function partModifiers(state: CarState): PartModifiers {
  const result: PartModifiers = {
    hpPercent: 0,
    weightReductionLb: 0,
    flatBonuses: [],
    noWearFromWinning: false,
    tractionImmunity: false,
  }
  for (const modId of state.parts) {
    for (const effect of getMod(modId).effects) {
      switch (effect.kind) {
        case 'hpPercent':
          result.hpPercent += effect.value
          break
        case 'weightReduction':
          result.weightReductionLb += effect.lb
          break
        case 'flatDistance':
          result.flatBonuses.push({ ft: effect.ft, window: effect.window })
          break
        case 'noWearFromWinning':
          result.noWearFromWinning = true
          break
        case 'tractionImmunity':
          result.tractionImmunity = true
          break
        default:
          break
      }
    }
  }
  return result
}

/** Fuel a car needs before it can advance: tier cost (DESIGN.md 2.2) adjusted by Parts. */
export function fuelCost(state: CarState): number {
  let cost = TUNABLES.fuelCostByTier[getCar(state.carId).tier]
  for (const modId of state.parts) {
    for (const effect of getMod(modId).effects) {
      if (effect.kind === 'fuelCostDelta') cost = Math.max(effect.minimum, cost + effect.value)
    }
  }
  return cost
}

/** Off-road cars and cars with a Wheelie Bar ignore Traction sabotage. */
export function isTractionImmune(state: CarState): boolean {
  return getCar(state.carId).type === 'offroad' || partModifiers(state).tractionImmunity
}

/** Whether this car takes a wear point when it wins a race (Roll Cage says no). */
export function gainsWearFromWinning(state: CarState): boolean {
  return !partModifiers(state).noWearFromWinning
}
