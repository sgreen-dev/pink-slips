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
  /** K in base = floor(K × hp × type multiplier ÷ weight), the step 3 of DESIGN.md 3.3. */
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
  /**
   * The least of its advance a worn car keeps, however much wear it carries (backlog G18). At the
   * rate above a car reaches it at 9 wear, 18 for Luxury; without it, 10 wear stopped a car dead
   * and a race between two worn cars never ended.
   */
  wearFloor: 0.1,
  partSlots: 2,
  partSlotsJdm: 3,
  garageSize: 5,
  pinkSlipsToWin: 3,
  modDeckSize: 30,
  startingHandSize: 5,
  drawPerTurn: 1,
  maxCopiesPerMod: 3,
  /** Copies of a rare mod a deck may hold (DESIGN.md 2.5). */
  maxCopiesPerRareMod: 1,
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
    /** Extra cars per pack for each lap taken (DESIGN.md 12, Laps), and the most laps that count. */
    lapBonusCars: 1,
    lapBonusCap: 2,
    /** Chance that a pack card is foil, and that it is holo. Exclusive; the rest are base. */
    foilOdds: 0.1,
    holoOdds: 0.02,
    /** Chance that each mod slot in a pack holds a rare mod instead of a common one. */
    rareModOdds: 0.05,
    /**
     * Scrapping surplus copies for credits, and buying a card outright with them (DESIGN.md 12).
     * Both are keyed by tier; a mod grades as Common, or as Rare when the mod itself is rare.
     * About forty duplicates of a grade buys one card of it.
     */
    scrapValue: { daily: 1, performance: 2, super: 5, hyper: 12 } as Readonly<Record<Tier, number>>,
    cardPrice: { daily: 40, performance: 80, super: 200, hyper: 500 } as Readonly<
      Record<Tier, number>
    >,
    /** Odds that a car slot in a pack holds each tier. Must sum to 1. */
    carTierOdds: { daily: 0.55, performance: 0.3, super: 0.12, hyper: 0.03 } as Readonly<
      Record<Tier, number>
    >,
  },
  /** Online accounts and matchmaking (DESIGN.md 13). */
  /**
   * The balance targets `npm run sim` checks (DESIGN.md 7). They were written inline in
   * `src/sim/run.ts`, though DESIGN.md 7 calls them tunable and section 4 says no number lives
   * anywhere but here (backlog Q51).
   */
  sim: {
    /** No single-type garage wins more than this against the field. */
    maxTypeWin: 0.6,
    /** No single-tier garage wins more than this against the field. */
    maxTierWin: 0.65,
    /** Nor less than this: the floor, which today's tiers do not meet (backlog G5). */
    minTierWin: 0.2,
    /** A Daily-only garage against a Hyper-only one lands inside this band. */
    dailyVsHyper: [0.35, 0.65] as readonly [number, number],
    /** The median match takes this many turns per player, or fewer. */
    maxMedianTurns: 25,
    /** The first player wins inside this band: going first is worth something, but not much. */
    firstPlayer: [0.47, 0.55] as readonly [number, number],
  },
  online: {
    /** The rating every account starts with. */
    ratingStart: 1000,
    /** Elo K factor: the most a single match can move a rating. */
    ratingK: 32,
    /** Largest rating gap the queue accepts while both players are fresh. */
    pairWindow: 200,
    /** Wait, in ms, after which a player is paired with anyone. */
    pairWaitMs: 30_000,
    /** Rated players needed before the window applies at all. */
    pairMinRated: 50,
    /** How long a seat has to act in a ranked room before it forfeits the match. */
    turnLimitMs: 90_000,
    /** How long the countdown pauses for a disconnected seat before it runs anyway. */
    disconnectGraceMs: 30_000,
    /** New players one address may make in a window, before the service refuses more. */
    creationsPerWindow: 5,
    /** The window that count is taken over, in ms. */
    creationWindowMs: 60 * 60 * 1000,
  },
} as const
