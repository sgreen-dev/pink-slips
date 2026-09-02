export { computeAdvance, typeIdentityBonusFt } from './advance.ts'
export type { AdvanceBreakdown, AdvanceInput } from './advance.ts'
export {
  apply,
  createMatch,
  currentPlayer,
  fuelCost,
  isLegal,
  isOver,
  legalActions,
  otherPlayer,
  stagedCar,
} from './match.ts'
export { flipCoin, nextFloat, nextInt, nextUint32, seedRng, shuffle } from './rng.ts'
export type { RngState } from './rng.ts'
export { TUNABLES } from './tunables.ts'
export type {
  Action,
  CarState,
  LogEntry,
  MatchConfig,
  MatchPhase,
  MatchState,
  PlayerConfig,
  PlayerIndex,
  PlayerState,
  RaceState,
  TurnState,
  TurnStep,
} from './types.ts'
