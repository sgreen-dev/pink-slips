import { STARTERS } from '../data/starters.ts'
import { apply, currentPlayer, isOver, legalActions } from './match.ts'
import { nextInt, seedRng, type RngState } from './rng.ts'
import type { Action, MatchConfig, MatchState, PlayerIndex } from './types.ts'

/** Helpers shared by engine tests. Not part of the engine API. */

export function starterConfig(first = 0, second = 1): MatchConfig {
  const a = STARTERS[first]
  const b = STARTERS[second]
  if (!a || !b) throw new Error('No such starter')
  return {
    players: [
      { garage: a.cars, deck: a.deck },
      { garage: b.cars, deck: b.deck },
    ],
  }
}

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

/** Legal actions for whoever must act next. Empty when the match is over. */
export function pendingActions(state: MatchState): Action[] {
  const player = currentPlayer(state)
  return player === null ? [] : legalActions(state, player)
}

/** Applies the first legal action until the match is over or `maxActions` is reached. */
export function playOut(state: MatchState, maxActions = 10000): MatchState {
  let current = state
  for (let i = 0; i < maxActions && isOver(current) === null; i++) {
    const action = pendingActions(current)[0]
    if (!action) throw new Error('No legal action while the match is not over')
    current = apply(current, action)
  }
  return current
}

/** Applies uniformly random legal actions, chosen with a separate seeded generator. */
export function playOutRandomly(state: MatchState, seed: number, maxActions = 10000): MatchState {
  let current = state
  let rng: RngState = seedRng(seed)
  for (let i = 0; i < maxActions && isOver(current) === null; i++) {
    const actions = pendingActions(current)
    let index: number
    ;[index, rng] = nextInt(rng, actions.length)
    const action = actions[index]
    if (!action) throw new Error('No legal action while the match is not over')
    current = apply(current, action)
  }
  return current
}

/** Stages the first garage car for each pending player. */
export function stageBoth(state: MatchState): MatchState {
  let current = state
  while (current.phase.kind === 'staging') {
    const action = pendingActions(current)[0]
    if (!action) throw new Error('Nothing to stage')
    current = apply(current, action)
  }
  return current
}

/** Stages a specific car for a player who is pending. */
export function stage(state: MatchState, player: PlayerIndex, carId: string): MatchState {
  return apply(state, { type: 'stage', player, carId })
}

/**
 * Plays one full turn for the current player: fuel the given car (default the staged car),
 * end the mod step, and advance if the engine allows it.
 */
export function playTurn(state: MatchState, fuelCarId?: string): MatchState {
  if (state.phase.kind !== 'turn') throw new Error('Not in a turn')
  const player = state.turn.player
  const carId = fuelCarId ?? state.players[player].stagedCarId
  if (carId === null) throw new Error('No car to fuel')
  let current = apply(state, { type: 'fuel', player, carId })
  current = apply(current, { type: 'endMods', player })
  if (current.phase.kind === 'turn' && current.turn.player === player) {
    current = apply(current, { type: 'advance', player })
  }
  return current
}
