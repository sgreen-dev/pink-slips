/**
 * Card data types. See DESIGN.md section 2.
 *
 * Mod effects are typed data the engine interprets. Nothing in this file is a function
 * the engine calls; the engine reads the descriptors and applies the rules itself.
 */

/** Rarity band, set by power-to-weight. Determines fuel cost. */
export type Tier = 'daily' | 'performance' | 'super' | 'hyper'

/** Tiers in ascending order. */
export const TIERS: readonly Tier[] = ['daily', 'performance', 'super', 'hyper']

/** A car's character. Each type has one mechanical identity (DESIGN.md 2.3). */
export type CarType = 'sports' | 'luxury' | 'muscle' | 'jdm' | 'ev' | 'offroad'

/** Car types in the order the design doc lists them. */
export const CAR_TYPES: readonly CarType[] = ['sports', 'luxury', 'muscle', 'jdm', 'ev', 'offroad']

export const CAR_TYPE_LABEL: Readonly<Record<CarType, string>> = {
  sports: 'Sports',
  luxury: 'Luxury',
  muscle: 'Muscle',
  jdm: 'JDM',
  ev: 'EV',
  offroad: 'Off-road',
}

export type Drivetrain = 'RWD' | 'FWD' | 'AWD' | '4WD'

export interface Car {
  /** Unique kebab-case id, shared namespace with mods. */
  id: string
  /** Display name, e.g. "Porsche 911 Carrera S". */
  name: string
  make: string
  model: string
  /** Only when needed to disambiguate, e.g. "992" or "1967". */
  generation?: string
  type: CarType

  /** Derived from hp / weightLb unless tierNote records a judgment placement. */
  tier: Tier
  /** Present only when the tier was placed by judgment near a band boundary (DESIGN.md 2.2). */
  tierNote?: string

  // Mechanical fields
  /** Horsepower as published. Numerator of the advance formula. */
  hp: number
  /** Weight in pounds as published. Denominator of the advance formula. */
  weightLb: number

  // Flavor fields, printed, no effect in v1
  drivetrain: Drivetrain
  zeroToSixtySec: number
  topSpeedMph: number
  engine: string
  productionYears: string

  // Data fields
  /** Where the hp and weight figures came from. */
  source: string
  /** Empty in v1. */
  imageUrl: string
}

export type ModFamily = 'part' | 'boost' | 'sabotage'
export type SabotageKind = 'traction' | 'pit'

/** Which advances in a race a distance bonus applies to. */
export type AdvanceWindow =
  | { when: 'always' }
  /** The car's first advance of each race. */
  | { when: 'firstAdvance' }
  /** Advances that start at or past minStartFt. */
  | { when: 'fromDistance'; minStartFt: number }

/**
 * One thing a mod does. A mod is a list of these.
 * Numbered comments refer to the advance steps in DESIGN.md 3.3.
 */
export type ModEffect =
  // Advance math
  /** Step 1: adds to the percentage hp modifier sum. 0.2 means +20%. */
  | { kind: 'hpPercent'; value: number }
  /** Step 1: adds value once per Part attached to the car. */
  | { kind: 'hpPercentPerPart'; value: number }
  /** Step 2: subtracts from effective weight. */
  | { kind: 'weightReduction'; lb: number }
  /** Step 4: flat feet added to this car's advance when the window applies. */
  | { kind: 'flatDistance'; ft: number; window: AdvanceWindow }
  /** Multiplies this advance. 0.5 means +50%. */
  | { kind: 'distancePercent'; value: number }
  /** Step 5: flat feet removed from the opponent's next advance. */
  | { kind: 'reduceDistance'; ft: number }
  /** Step 5: halves the opponent's next advance, after flat reductions. */
  | { kind: 'halveDistance' }
  /** The opponent's staged car skips its next advance if the condition holds when played. */
  | { kind: 'skipAdvance'; condition: 'notYetAdvancedThisRace' }
  /** Advance again this turn at a fraction of the distance. */
  | { kind: 'extraAdvance'; distanceMultiplier: number }

  // Car state
  /** Changes this car's fuel cost, never below minimum. */
  | { kind: 'fuelCostDelta'; value: number; minimum: number }
  /** This car gains no wear from winning a race. */
  | { kind: 'noWearFromWinning' }
  /** Permanent immunity to Traction sabotage. */
  | { kind: 'tractionImmunity' }
  /** This car's next advance cannot be reduced by Traction sabotage. */
  | { kind: 'tractionShield' }
  | { kind: 'addWear'; target: 'self' | 'opponent'; count: number }
  | { kind: 'addFuel'; target: 'self'; count: number }
  | { kind: 'removeFuel'; target: 'opponent'; count: number }
  /** Move every fuel token from one of your cars to another. Both chosen when played. */
  | { kind: 'moveAllFuel' }
  /** Discard a Part from the opponent's staged car. */
  | { kind: 'discardPart'; chooser: 'opponent' }

  // Turn and cards
  /** Place this many additional fuel tokens this turn. */
  | { kind: 'extraFuelPlacement'; count: number }
  | { kind: 'draw'; count: number }
  /** Search your deck for a card of this family, put it in hand, shuffle. */
  | { kind: 'searchDeck'; family: ModFamily; count: number }
  /** The opponent cannot play a Boost on their next turn. */
  | { kind: 'blockBoost' }

  // Randomness, through the engine's seeded generator (DESIGN.md 3.6)
  | { kind: 'coinFlip'; heads: readonly ModEffect[]; tails: readonly ModEffect[] }

interface ModBase {
  /** Unique kebab-case id, shared namespace with cars. */
  id: string
  name: string
  /** Printed rules text. */
  text: string
  /** Playable only on or for cars of this type. */
  typeLock?: CarType
  effects: readonly ModEffect[]
}

/** Attaches permanently to one of your cars and takes a slot. */
export interface PartMod extends ModBase {
  family: 'part'
}

/** One-shot, helps your staged car or your turn, one per turn. */
export interface BoostMod extends ModBase {
  family: 'boost'
  /** Fuel removed from the staged car when played. */
  fuelCost?: number
}

/** One-shot, hurts the opponent's staged car, one per turn. */
export interface SabotageMod extends ModBase {
  family: 'sabotage'
  kind: SabotageKind
}

export type Mod = PartMod | BoostMod | SabotageMod

/** A prebuilt garage and deck that ships with the game (DESIGN.md 5). */
export interface StarterGarage {
  id: string
  name: string
  style: string
  /** Exactly 5 car ids. */
  cars: readonly string[]
  /** Exactly 30 mod ids, at most 3 of any one mod. */
  deck: readonly string[]
}
