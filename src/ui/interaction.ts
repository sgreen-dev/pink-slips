import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import {
  currentPlayer,
  legalActions,
  otherPlayer,
  type Action,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'

/**
 * What the board's clicks mean. Everything here is derived from legalActions so the UI can
 * never offer a play the engine would reject.
 */

export type Selection =
  | { kind: 'none' }
  /** A Part waiting for a car, or Tow Truck waiting for its source. */
  | { kind: 'mod'; modId: string }
  /** Tow Truck with its source chosen, waiting for the destination. */
  | { kind: 'towFrom'; modId: string; fromCarId: string }

export const NO_SELECTION: Selection = { kind: 'none' }

export type CarIntent = { kind: 'apply'; action: Action } | { kind: 'select'; selection: Selection }

/** What a click on each of the player's own garage cars does right now, keyed by car id. */
export function carIntents(
  state: MatchState,
  player: PlayerIndex,
  selection: Selection,
): Map<string, CarIntent> {
  const intents = new Map<string, CarIntent>()
  const actions = legalActions(state, player)
  if (selection.kind === 'mod') {
    const mod = getMod(selection.modId)
    for (const action of actions) {
      if (mod.family === 'part' && action.type === 'playPart' && action.modId === mod.id) {
        intents.set(action.carId, { kind: 'apply', action })
      }
      if (
        action.type === 'playBoost' &&
        action.modId === mod.id &&
        action.fromCarId &&
        !intents.has(action.fromCarId)
      ) {
        intents.set(action.fromCarId, {
          kind: 'select',
          selection: { kind: 'towFrom', modId: mod.id, fromCarId: action.fromCarId },
        })
      }
    }
    return intents
  }
  if (selection.kind === 'towFrom') {
    for (const action of actions) {
      if (
        action.type === 'playBoost' &&
        action.modId === selection.modId &&
        action.fromCarId === selection.fromCarId &&
        action.toCarId
      ) {
        intents.set(action.toCarId, { kind: 'apply', action })
      }
    }
    return intents
  }
  for (const action of actions) {
    if (action.type === 'stage' || action.type === 'fuel') {
      intents.set(action.carId, { kind: 'apply', action })
    }
  }
  return intents
}

export type ModIntent =
  | { kind: 'apply'; action: Action }
  | { kind: 'select'; selection: Selection }
  /** Sponsor: the player picks which Part to fetch. */
  | { kind: 'options'; options: Action[] }
  | { kind: 'unplayable' }

/** What a click on a card in the player's hand does right now. */
export function modIntent(state: MatchState, player: PlayerIndex, modId: string): ModIntent {
  const plays = legalActions(state, player).filter((a) => 'modId' in a && a.modId === modId)
  const first = plays[0]
  if (!first) return { kind: 'unplayable' }
  const mod = getMod(modId)
  if (mod.family === 'part') return { kind: 'select', selection: { kind: 'mod', modId } }
  if (first.type === 'playBoost') {
    if (plays.some((a) => a.type === 'playBoost' && a.fromCarId)) {
      return { kind: 'select', selection: { kind: 'mod', modId } }
    }
    if (plays.some((a) => a.type === 'playBoost' && a.targetModId)) {
      return { kind: 'options', options: plays }
    }
  }
  return { kind: 'apply', action: first }
}

/** Buttons that do not need a target: end the mod step, advance, or a Parts Thief pick. */
export function buttonActions(state: MatchState, player: PlayerIndex): Action[] {
  return legalActions(state, player).filter(
    (a) => a.type === 'endMods' || a.type === 'advance' || a.type === 'discardPart',
  )
}

/** The one-line instruction shown above the controls. */
export function prompt(
  state: MatchState,
  viewer: PlayerIndex,
  selection: Selection,
  names: readonly [string, string],
): string {
  const acting = currentPlayer(state)
  if (acting === null) return 'The match is over.'
  if (acting !== viewer) return `Waiting for ${names[acting]}.`
  const { phase } = state
  if (phase.kind === 'staging') {
    const own = state.players[viewer].stagedCarId
    return own === null
      ? 'Stage a car from your garage.'
      : `Keep ${getCar(own).name} staged, or swap to another car for free.`
  }
  if (phase.kind === 'choice') return 'Parts Thief: choose a Part to give up.'
  if (selection.kind === 'mod') {
    const mod = getMod(selection.modId)
    return mod.family === 'part'
      ? `Choose a car for ${mod.name}.`
      : `${mod.name}: choose the car to take fuel from.`
  }
  if (selection.kind === 'towFrom') {
    const from = state.players[viewer].garage.find((c) => c.carId === selection.fromCarId)
    return `${getMod(selection.modId).name}: choose the car to receive ${from?.fuel ?? 0} fuel.`
  }
  switch (state.turn.step) {
    case 'fuel':
      return 'Place a fuel token on any of your cars.'
    case 'mods':
      return state.turn.extraFuel > 0
        ? 'Extra Tank: place another fuel token.'
        : 'Play Parts, one Boost, and one Sabotage, then end the mod step.'
    case 'advance':
      return 'Your car is fueled. Advance!'
  }
}

/** Short status for the header: whose turn, which step. */
export function turnSummary(state: MatchState, names: readonly [string, string]): string {
  const acting = currentPlayer(state)
  if (acting === null) return 'Match over'
  if (state.phase.kind === 'staging') return `Race ${state.race.number}: ${names[acting]} stages`
  if (state.phase.kind === 'choice') return `${names[acting]} chooses a Part`
  const step = { fuel: 'fuel', mods: 'mods', advance: 'advance' }[state.turn.step]
  return `Race ${state.race.number} · Turn ${state.turn.number} · ${names[acting]} · ${step}`
}

export function opponentOf(player: PlayerIndex): PlayerIndex {
  return otherPlayer(player)
}
