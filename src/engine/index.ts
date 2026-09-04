export { computeAdvance, typeIdentityBonusFt, windowApplies } from './advance.ts'
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
export {
  gainsWearFromWinning,
  isTractionImmune,
  openSlots,
  partModifiers,
  partSlots,
} from './mods.ts'
export type { PartModifiers } from './mods.ts'
export { flipCoin, nextFloat, nextInt, nextUint32, seedRng, shuffle } from './rng.ts'
export type { RngState } from './rng.ts'
export { HIDDEN_CARD, isHidden, redact } from './redact.ts'
export { TUNABLES } from './tunables.ts'
export { NO_ADVANCE_MODIFIERS, NO_PENDING_SABOTAGE } from './types.ts'
export type {
  Action,
  AdvanceModifiers,
  CarState,
  LogEntry,
  MatchConfig,
  MatchPhase,
  MatchState,
  PendingSabotage,
  PlayerConfig,
  PlayerIndex,
  PlayerState,
  RaceState,
  TurnState,
  TurnStep,
  WindowedBonus,
} from './types.ts'
