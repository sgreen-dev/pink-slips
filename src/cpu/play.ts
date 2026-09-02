import {
  apply,
  createMatch,
  currentPlayer,
  isLegal,
  isOver,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'
import { chooseAction } from './cpu.ts'

export interface CpuMatchOptions {
  /** Tie-break seeds per player. Default to the match seed. */
  cpuSeeds?: readonly [number, number]
  /** Safety cap; a match that runs past it throws. */
  maxActions?: number
}

export interface CpuMatchResult {
  state: MatchState
  winner: PlayerIndex
  actions: number
  /** Turns taken in the match, counting both players. */
  turns: number
}

/** Plays a full CPU versus CPU match from a config and seed. Used by tests and the simulator. */
export function playCpuMatch(
  config: MatchConfig,
  seed: number,
  options: CpuMatchOptions = {},
): CpuMatchResult {
  const cpuSeeds = options.cpuSeeds ?? [seed, seed]
  const maxActions = options.maxActions ?? 20000
  let state = createMatch(config, seed)
  let actions = 0
  for (;;) {
    const winner = isOver(state)
    if (winner !== null) return { state, winner, actions, turns: state.turn.number }
    const player = currentPlayer(state)
    if (player === null) throw new Error('No player to act while the match is not over')
    const action = chooseAction(state, player, cpuSeeds[player])
    if (!isLegal(state, action)) {
      throw new Error(`CPU chose an illegal action: ${JSON.stringify(action)}`)
    }
    state = apply(state, action)
    actions++
    if (actions > maxActions) throw new Error(`Match passed ${maxActions} actions without ending`)
  }
}
