import { chooseAction, type Level } from '../cpu/index.ts'
import {
  apply,
  createMatch,
  currentPlayer,
  isOver,
  otherPlayer,
  TUNABLES,
  type Action,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'

/**
 * The moment after a car crosses the finish line. The engine moves straight on to staging, so
 * the board keeps this record and holds on it until the player continues or a timer fires.
 */
export interface RaceEnd {
  race: number
  winner: PlayerIndex
  loser: PlayerIndex
  /** The car that crossed the line. */
  winningCarId: string
  /** The loser's car, now the winner's pink slip. */
  capturedCarId: string
  /** Where each car sat when the race ended, in feet, by player. */
  distanceFt: readonly [number, number]
  /** The winner's pink slips, counting this one. */
  slips: number
  /** True when this pink slip ends the match. */
  matchOver: boolean
}

/**
 * The race that ended between two consecutive states, or null when none did. Reads the log
 * entries `next` added, so it needs no knowledge of how the engine moves between phases.
 */
export function raceEndBetween(previous: MatchState, next: MatchState): RaceEnd | null {
  const added = next.log.slice(previous.log.length)
  const end = added.find((entry) => entry.kind === 'raceEnd')
  if (end?.kind !== 'raceEnd') return null
  const { race, winner, capturedCarId } = end
  const loser = otherPlayer(winner)
  const advance = added.find((entry) => entry.kind === 'advance' && entry.player === winner)
  const winningCarId =
    advance?.kind === 'advance' ? advance.carId : previous.players[winner].stagedCarId
  if (winningCarId === null) return null
  const winnerFt = advance?.kind === 'advance' ? advance.toFt : TUNABLES.trackLengthFt
  const loserFt = previous.race.distanceFt[loser]
  return {
    race,
    winner,
    loser,
    winningCarId,
    capturedCarId,
    distanceFt: winner === 0 ? [winnerFt, loserFt] : [loserFt, winnerFt],
    slips: next.players[winner].pinkSlips.length,
    matchOver: next.phase.kind === 'over',
  }
}

/**
 * What a match screen holds: the engine state, the race end while the board waits at the line,
 * and the states from before each mod play in the current mod step, so a play can be taken
 * back until the step ends or the player advances.
 */
export interface Session {
  match: MatchState
  raceEnd: RaceEnd | null
  history: MatchState[]
}

/** A mod play during the mod step can be taken back; anything else makes plays final. */
export function isModPlay(action: Action): boolean {
  return action.type === 'playPart' || action.type === 'playBoost' || action.type === 'playSabotage'
}

/** True when the viewer can take back the last mod they played this step. */
export function canUndo(session: Session, viewer: PlayerIndex): boolean {
  const { match, raceEnd, history } = session
  return (
    raceEnd === null &&
    history.length > 0 &&
    match.phase.kind === 'turn' &&
    match.turn.step === 'mods' &&
    currentPlayer(match) === viewer
  )
}

export type SessionEvent =
  | { type: 'act'; action: Action }
  | { type: 'cpuStep'; seat: PlayerIndex; seed: number; level?: Level }
  | { type: 'continue' }
  | { type: 'undo'; player: PlayerIndex }

export function startSession({ config, seed }: { config: MatchConfig; seed: number }): Session {
  return { match: createMatch(config, seed), raceEnd: null, history: [] }
}

/**
 * Applies one event. Nothing changes the match while a race end is held on screen: the board is
 * inert and the CPU waits, so a late click or timer lands here and is ignored.
 */
export function reduceSession(session: Session, event: SessionEvent): Session {
  switch (event.type) {
    case 'act':
      return step(session, event.action)
    case 'cpuStep': {
      const { match, raceEnd } = session
      if (raceEnd !== null || isOver(match) !== null || currentPlayer(match) !== event.seat) {
        return session
      }
      return step(session, chooseAction(match, event.seat, event.seed, event.level ?? 'street'))
    }
    case 'continue':
      return session.raceEnd === null ? session : { ...session, raceEnd: null }
    case 'undo': {
      if (!canUndo(session, event.player)) return session
      const previous = session.history[session.history.length - 1] as MatchState
      return { match: previous, raceEnd: null, history: session.history.slice(0, -1) }
    }
  }
}

function step(session: Session, action: Action): Session {
  if (session.raceEnd !== null) return session
  const match = apply(session.match, action)
  const before = session.match
  const keep = isModPlay(action) && before.phase.kind === 'turn' && before.turn.step === 'mods'
  const history = keep ? [...session.history, before] : []
  return { match, raceEnd: raceEndBetween(before, match), history }
}
