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
  /** Attached Part mod ids. Filled in phase 3. */
  parts: readonly string[]
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
}

/** The steps of a turn after the automatic draw (DESIGN.md 3.2). */
export type TurnStep = 'fuel' | 'mods' | 'advance'

export interface TurnState {
  player: PlayerIndex
  /** Counts every turn in the match from 1. The first player takes turn 1. */
  number: number
  step: TurnStep
}

export interface RaceState {
  number: number
  distanceFt: readonly [number, number]
  /** Advances each player's staged car has made this race. */
  advances: readonly [number, number]
}

export type MatchPhase =
  /** Players in `pending`, in order, must each stage a car before play continues. */
  | { kind: 'staging'; pending: readonly PlayerIndex[] }
  | { kind: 'turn' }
  | { kind: 'over'; winner: PlayerIndex }

export type LogEntry =
  | { kind: 'coinFlip'; purpose: 'firstPlayer'; heads: boolean; firstPlayer: PlayerIndex }
  | { kind: 'draw'; player: PlayerIndex; count: number }
  | { kind: 'reshuffle'; player: PlayerIndex; count: number }
  | { kind: 'stage'; player: PlayerIndex; carId: string }
  | { kind: 'fuel'; player: PlayerIndex; carId: string }
  | {
      kind: 'advance'
      player: PlayerIndex
      carId: string
      fromFt: number
      toFt: number
      breakdown: AdvanceBreakdown
    }
  | { kind: 'advanceSkipped'; player: PlayerIndex; reason: 'firstTurn' | 'notFueled' }
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

/** Every decision a player can make. Mod plays arrive in phase 3. */
export type Action =
  | { type: 'stage'; player: PlayerIndex; carId: string }
  | { type: 'fuel'; player: PlayerIndex; carId: string }
  | { type: 'endMods'; player: PlayerIndex }
  | { type: 'advance'; player: PlayerIndex }
