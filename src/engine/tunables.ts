import type { Tier } from '../data/types.ts'

/**
 * Every tunable from DESIGN.md section 4. Nothing else in the engine hardcodes these values.
 * A change here gets a line in docs/balance-log.md saying what changed and why.
 *
 * Mod magnitudes are card text and live with the cards in src/data/mods.ts as effect
 * descriptors, which section 4 lists as "as listed in 2.5".
 */
export const TUNABLES = {
  /** A quarter mile. Fixed by theme. */
  trackLengthFt: 1320,
  /** K in base = floor(K × hp ÷ weight). */
  advanceK: 3000,
  /** Fuel a car needs before it can advance, by tier. */
  fuelCostByTier: { daily: 1, performance: 2, super: 3, hyper: 5 } as Readonly<
    Record<Tier, number>
  >,
  /** Advance multiplier lost per wear point. */
  wearRate: 0.1,
  partSlots: 2,
  partSlotsJdm: 3,
  garageSize: 5,
  pinkSlipsToWin: 3,
  modDeckSize: 30,
  startingHandSize: 5,
  drawPerTurn: 1,
  maxCopiesPerMod: 3,
  boostsPerTurn: 1,
  sabotagePerTurn: 1,
  /** Type identity magnitudes from DESIGN.md 2.3. */
  typeIdentity: {
    /** EV: added to the car's first advance of each race. */
    evFirstAdvanceFt: 100,
    /** Muscle: added to any advance that starts at or past muscleTopEndFromFt. */
    muscleTopEndFt: 75,
    muscleTopEndFromFt: 660,
    /** Luxury: wear rate is multiplied by this. */
    luxuryWearMultiplier: 0.5,
  },
} as const
