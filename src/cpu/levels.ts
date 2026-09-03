/**
 * CPU difficulty levels (DESIGN.md section 6). A level is a profile of switches the decision
 * code reads; the engine never sees it. Street is the original opponent.
 */

export type Level = 'rookie' | 'street' | 'pro'

export const LEVELS: readonly Level[] = ['rookie', 'street', 'pro']

export const LEVEL_LABEL: Readonly<Record<Level, string>> = {
  rookie: 'Rookie',
  street: 'Street',
  pro: 'Pro',
}

export const LEVEL_BLURB: Readonly<Record<Level, string>> = {
  rookie: 'Stages its fastest car and rarely plays a card.',
  street: 'The regular opponent.',
  pro: 'Times its stalls, fuels for the next race, and bets on coin flips.',
}

export type CoinFlips = 'tails' | 'expected'

export interface Profile {
  /** Play a Boost that wins this advance (priority 1). */
  winRule: boolean
  /** Play a Sabotage that stops the opponent winning next turn (priority 2). */
  stopRule: boolean
  /** Multiplies the worth a card needs before it is spent outside those rules. */
  thresholdMultiplier: number
  /** Stage the car with the highest standing-start advance, ignoring fuel and wear. */
  stageByAdvanceOnly: boolean
  /** Hold a first-advance stall until the opponent's staged car is fueled. */
  holdStalls: boolean
  /** Fuel the bench car that can be ready by the time the current race ends. */
  benchByRace: boolean
  /** How coin flips are read in forecasts. */
  coinFlips: CoinFlips
  /** Stage the car that finishes a race in the fewest turns, fueling included. */
  stageByTurns: boolean
  /** Value Boosts and Sabotage by the turns they save or add, not the feet. */
  turnCount: boolean
}

const PROFILES: Readonly<Record<Level, Profile>> = {
  rookie: {
    winRule: false,
    stopRule: false,
    thresholdMultiplier: 2,
    stageByAdvanceOnly: true,
    holdStalls: false,
    benchByRace: false,
    coinFlips: 'tails',
    stageByTurns: false,
    turnCount: false,
  },
  street: {
    winRule: true,
    stopRule: true,
    thresholdMultiplier: 1,
    stageByAdvanceOnly: false,
    holdStalls: false,
    benchByRace: false,
    coinFlips: 'tails',
    stageByTurns: false,
    turnCount: false,
  },
  pro: {
    winRule: true,
    stopRule: true,
    thresholdMultiplier: 1,
    stageByAdvanceOnly: false,
    holdStalls: true,
    benchByRace: false,
    coinFlips: 'expected',
    stageByTurns: true,
    turnCount: true,
  },
}

export function profileFor(level: Level): Profile {
  return PROFILES[level]
}
