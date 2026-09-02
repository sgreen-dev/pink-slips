import type { AdvanceWindow } from '../data/types.ts'
import type { AdvanceBreakdown } from './advance.ts'
import type { RngState } from './rng.ts'

/** Player seat. Player 0 is always the first entry in the match config. */
export type PlayerIndex = 0 | 1

/** What a player brings to a match (DESIGN.md 3.1). */
export interface PlayerConfig {
  /** Exactly garageSize unique car ids. */
  garage: readonly string[]
  /** Exactly modDeckSize mod ids, at most maxCopiesPerMod of any one. */
  deck: readonly string[]
}

export interface MatchConfig {
  players: readonly [PlayerConfig, PlayerConfig]
}

/** A car in a garage. Face up for the whole match. */
export interface CarState {
  carId: string
  fuel: number
  wear: number
  /** Attached Part mod ids. */
  parts: readonly string[]
  /** Launch Control: this car's next advance ignores Traction sabotage. Cleared when it advances. */
  tractionShield: boolean
}

/** Traction sabotage waiting on a player's staged car's next advance (DESIGN.md 2.5). */
export interface PendingSabotage {
  flatReductionFt: number
  halve: boolean
  /** Red Light: the next advance is skipped instead of made. */
  skipAdvance: boolean
}

export const NO_PENDING_SABOTAGE: PendingSabotage = {
  flatReductionFt: 0,
  halve: false,
  skipAdvance: false,
}

export interface PlayerState {
  /** Cars still owned. Includes the staged car. Never empties (DESIGN.md 3.5). */
  garage: readonly CarState[]
  /** Id of the garage car currently racing, or null between races. */
  stagedCarId: string | null
  hand: readonly string[]
  deck: readonly string[]
  discard: readonly string[]
  /** Captured car ids. Three wins the match. */
  pinkSlips: readonly string[]
  /** Sabotage waiting on this player's staged car. Cleared when it advances and at race end. */
  pendingSabotage: PendingSabotage
  /** Roadblock: this player cannot play a Boost on their next turn. */
  boostBlockedNextTurn: boolean
}

/** A flat distance bonus that applies when its window does. */
export interface WindowedBonus {
  ft: number
  window: AdvanceWindow
}

/** Boost effects collected during the mod step that apply to this turn's advance. */
export interface AdvanceModifiers {
  hpPercent: number
  /** Anti-Lag: hp percent per Part on the staged car. */
  hpPercentPerPart: number
  weightReductionLb: number
  flatBonuses: readonly WindowedBonus[]
  /** Redline: multiplier on this advance, 0.5 means +50%. */
  distancePercent: number
  /** Overdrive: a second advance this turn at this fraction of its distance. */
  extraAdvanceMultiplier: number | null
  /** Redline: wear the staged car gains after it advances. */
  wearAfterAdvance: number
}

export const NO_ADVANCE_MODIFIERS: AdvanceModifiers = {
  hpPercent: 0,
  hpPercentPerPart: 0,
  weightReductionLb: 0,
  flatBonuses: [],
  distancePercent: 0,
  extraAdvanceMultiplier: null,
  wearAfterAdvance: 0,
}

/** The steps of a turn after the automatic draw (DESIGN.md 3.2). */
export type TurnStep = 'fuel' | 'mods' | 'advance'

export interface TurnState {
  player: PlayerIndex
  /** Counts every turn in the match from 1. The first player takes turn 1. */
  number: number
  step: TurnStep
  boostsPlayed: number
  sabotagePlayed: number
  /** Set by Roadblock on the previous turn. */
  boostBlocked: boolean
  /** Extra Tank: fuel placements still owed before the mod step can end. */
  extraFuel: number
  advance: AdvanceModifiers
}

export interface RaceState {
  number: number
  distanceFt: readonly [number, number]
  /** Advances each player's staged car has made this race. */
  advances: readonly [number, number]
  /** Coin flips each player's staged car has made this race, for the Sports identity. */
  coinFlips: readonly [number, number]
}

export type MatchPhase =
  /** Players in `pending`, in order, must each stage a car before play continues. */
  | { kind: 'staging'; pending: readonly PlayerIndex[] }
  | { kind: 'turn' }
  /** The turn is paused while `player` makes a choice a card forced on them. */
  | { kind: 'choice'; player: PlayerIndex; choice: { kind: 'discardPart'; carId: string } }
  | { kind: 'over'; winner: PlayerIndex }

export type LogEntry =
  | { kind: 'coinFlip'; purpose: 'firstPlayer'; heads: boolean; firstPlayer: PlayerIndex }
  | {
      kind: 'coinFlip'
      purpose: 'mod'
      player: PlayerIndex
      modId: string
      heads: boolean
      forcedBySports: boolean
    }
  | { kind: 'draw'; player: PlayerIndex; count: number }
  | { kind: 'reshuffle'; player: PlayerIndex; count: number }
  | { kind: 'stage'; player: PlayerIndex; carId: string }
  | { kind: 'fuel'; player: PlayerIndex; carId: string }
  | { kind: 'playPart'; player: PlayerIndex; modId: string; carId: string }
  | { kind: 'playBoost'; player: PlayerIndex; modId: string }
  | { kind: 'playSabotage'; player: PlayerIndex; modId: string }
  | { kind: 'discardPart'; player: PlayerIndex; carId: string; modId: string }
  | {
      kind: 'advance'
      player: PlayerIndex
      carId: string
      fromFt: number
      toFt: number
      breakdown: AdvanceBreakdown
    }
  | { kind: 'tractionIgnored'; player: PlayerIndex; reason: 'immune' | 'shield' }
  | { kind: 'advanceSkipped'; player: PlayerIndex; reason: 'firstTurn' | 'notFueled' | 'redLight' }
  | { kind: 'raceEnd'; race: number; winner: PlayerIndex; capturedCarId: string }
  | { kind: 'matchEnd'; winner: PlayerIndex }

export interface MatchState {
  players: readonly [PlayerState, PlayerState]
  firstPlayer: PlayerIndex
  phase: MatchPhase
  /** The current turn, or the next turn to begin while staging. */
  turn: TurnState
  race: RaceState
  rng: RngState
  log: readonly LogEntry[]
}

/** Every decision a player can make. */
export type Action =
  | { type: 'stage'; player: PlayerIndex; carId: string }
  | { type: 'fuel'; player: PlayerIndex; carId: string }
  | { type: 'playPart'; player: PlayerIndex; modId: string; carId: string }
  | {
      type: 'playBoost'
      player: PlayerIndex
      modId: string
      /** Tow Truck: the car losing all its fuel. */
      fromCarId?: string
      /** Tow Truck: the car receiving it. */
      toCarId?: string
      /** Sponsor: the Part to take from the deck. Omitted when the deck holds none. */
      targetModId?: string
    }
  | { type: 'playSabotage'; player: PlayerIndex; modId: string }
  /** Parts Thief: the targeted player picks which Part to lose. */
  | { type: 'discardPart'; player: PlayerIndex; modId: string }
  | { type: 'endMods'; player: PlayerIndex }
  | { type: 'advance'; player: PlayerIndex }
