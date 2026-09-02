import type { Car } from '../data/types.ts'
import { TUNABLES } from './tunables.ts'

/** Everything the advance formula needs (DESIGN.md 3.3). Mod inputs are filled in phase 3. */
export interface AdvanceInput {
  car: Car
  wear: number
  /** Where the car starts this advance. */
  startFt: number
  /** True on the staged car's first advance of the race. */
  isFirstAdvanceOfRace: boolean
  /** Step 1: sum of percentage hp modifiers from Parts and Boosts. 0.2 means +20%. */
  hpPercent?: number
  /** Step 2: total weight reduction from Parts. */
  weightReductionLb?: number
  /** Step 4: flat feet from Parts and Boosts. Type identity bonuses are computed here. */
  flatBonusFt?: number
  /** Step 5: Sabotage pending on this car. */
  sabotage?: { flatReductionFt: number; halve: boolean }
}

export interface AdvanceBreakdown {
  effectiveHp: number
  effectiveWeightLb: number
  /** Step 3. */
  baseFt: number
  /** Step 4, from the car's type identity. */
  typeBonusFt: number
  /** Step 4, from Parts and Boosts. */
  modBonusFt: number
  /** After step 5. */
  afterSabotageFt: number
  /** Step 6, shown as a decimal for display. */
  wearMultiplier: number
  finalFt: number
}

/** Flat feet the car's type adds to this advance (DESIGN.md 2.3). */
export function typeIdentityBonusFt(car: Car, startFt: number, isFirstAdvance: boolean): number {
  const identity = TUNABLES.typeIdentity
  if (car.type === 'ev' && isFirstAdvance) return identity.evFirstAdvanceFt
  if (car.type === 'muscle' && startFt >= identity.muscleTopEndFromFt)
    return identity.muscleTopEndFt
  return 0
}

/** Wear rate for a car, in basis points so wear math stays in integers. */
function wearRateBasisPoints(car: Car): number {
  const rate = TUNABLES.wearRate * 10000
  return Math.round(
    car.type === 'luxury' ? rate * TUNABLES.typeIdentity.luxuryWearMultiplier : rate,
  )
}

/**
 * The advance formula from DESIGN.md 3.3, computed in the order the doc lists. Every result
 * floors to whole feet with a minimum of 0.
 */
export function computeAdvance(input: AdvanceInput): AdvanceBreakdown {
  const { car, wear, startFt, isFirstAdvanceOfRace } = input
  const hpPercent = input.hpPercent ?? 0
  const weightReductionLb = input.weightReductionLb ?? 0
  const modBonusFt = input.flatBonusFt ?? 0
  const sabotage = input.sabotage ?? { flatReductionFt: 0, halve: false }

  // 1 and 2: effective hp and weight
  const effectiveHp = car.hp * (1 + hpPercent)
  const effectiveWeightLb = Math.max(1, car.weightLb - weightReductionLb)

  // 3: base distance. The epsilon keeps an exact integer from flooring down after float error.
  const baseFt = Math.max(
    0,
    Math.floor((TUNABLES.advanceK * effectiveHp) / effectiveWeightLb + 1e-9),
  )

  // 4: flat bonuses
  const typeBonusFt = typeIdentityBonusFt(car, startFt, isFirstAdvanceOfRace)
  const beforeSabotageFt = baseFt + typeBonusFt + modBonusFt

  // 5: sabotage, flat reductions first, then halving
  let afterSabotageFt = Math.max(0, beforeSabotageFt - sabotage.flatReductionFt)
  if (sabotage.halve) afterSabotageFt = Math.floor(afterSabotageFt / 2)

  // 6: wear
  const remainingBasisPoints = Math.max(0, 10000 - wearRateBasisPoints(car) * wear)
  const finalFt = Math.max(0, Math.floor((afterSabotageFt * remainingBasisPoints) / 10000))

  return {
    effectiveHp,
    effectiveWeightLb,
    baseFt,
    typeBonusFt,
    modBonusFt,
    afterSabotageFt,
    wearMultiplier: remainingBasisPoints / 10000,
    finalFt,
  }
}
