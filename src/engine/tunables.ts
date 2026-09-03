import type { CarType, Tier } from '../data/types.ts'

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
  /** Fuel a car needs before it can advance, by tier. Tuned in phase 5 from 1/2/3/5. */
  fuelCostByTier: { daily: 1, performance: 2, super: 4, hyper: 6 } as Readonly<
    Record<Tier, number>
  >,
  /**
   * Multiplies the base advance by car type. The first lever for heavy types (DESIGN.md 7),
   * set in phase 5 so Off-road, JDM, and Luxury garages can compete.
   */
  typeDistanceMultiplier: {
    sports: 1,
    luxury: 1.1,
    muscle: 1,
    jdm: 1.2,
    ev: 1,
    offroad: 1.2,
  } as Readonly<Record<CarType, number>>,
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
    /** EV: added to the car's first advance of each race. Tuned in phase 5 from 100. */
    evFirstAdvanceFt: 75,
    /** Muscle: added to any advance that starts at or past muscleTopEndFromFt. */
    muscleTopEndFt: 75,
    muscleTopEndFromFt: 660,
    /** Luxury: wear rate is multiplied by this. */
    luxuryWearMultiplier: 0.5,
  },
  /** Packs and the collection (DESIGN.md 12). */
  collection: {
    /** Packs for finishing any match. */
    packsPerMatch: 1,
    /** Packs for beating the CPU, replacing packsPerMatch. */
    packsPerCpuWin: 2,
    packCars: 2,
    packMods: 3,
    /** Chance that a pack card is foil, and that it is holo. Exclusive; the rest are base. */
    foilOdds: 0.1,
    holoOdds: 0.02,
    /** Odds that a car slot in a pack holds each tier. Must sum to 1. */
    carTierOdds: { daily: 0.55, performance: 0.3, super: 0.12, hyper: 0.03 } as Readonly<
      Record<Tier, number>
    >,
  },
} as const
