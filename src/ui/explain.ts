import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { CAR_TYPE_LABEL, type CarType, type ModEffect } from '../data/types.ts'
import {
  currentPlayer,
  TUNABLES,
  windowApplies,
  type Action,
  type AdvanceBreakdown,
  type LogEntry,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'
import { modIntent, type Selection } from './interaction.ts'

/**
 * Plain words for what the board otherwise leaves unsaid (DESIGN.md 8, Mod hints): why a card
 * in the hand cannot be played, what is waiting on a car's next advance, which Boosts are in
 * play this turn, and what changed an advance's distance. Everything is read from the state
 * the board already holds, so the redacted online view has all of it.
 */

function lockLabel(type: CarType): string {
  return `${type.toUpperCase()} only.`
}

/**
 * Why the player cannot play this card right now, or null when they can, or when the hand
 * is not theirs to play from: outside their own mod step the prompt says what to do instead.
 * The checks follow the engine's own order in `modActions`.
 */
export function blockedReason(
  state: MatchState,
  player: PlayerIndex,
  modId: string,
): string | null {
  if (state.phase.kind !== 'turn' || state.turn.player !== player) return null
  if (state.turn.step !== 'mods') return null
  if (modIntent(state, player, modId).kind !== 'unplayable') return null
  const { turn } = state
  const me = state.players[player]
  const mod = getMod(modId)
  const staged = me.garage.find((car) => car.carId === me.stagedCarId)
  switch (mod.family) {
    case 'part': {
      const lock = mod.typeLock
      if (lock && !me.garage.some((car) => getCar(car.carId).type === lock)) {
        return `${lockLabel(lock)} No ${CAR_TYPE_LABEL[lock]} car in your garage.`
      }
      return `No open Part slot. Cars hold ${TUNABLES.partSlots} Parts, JDM ${TUNABLES.partSlotsJdm}.`
    }
    case 'boost': {
      if (turn.boostBlocked) return 'Roadblock: no Boost this turn.'
      if (turn.boostsPlayed >= TUNABLES.boostsPerTurn) return 'One Boost per turn, already played.'
      const lock = mod.typeLock
      if (lock && staged && getCar(staged.carId).type !== lock) {
        return `${lockLabel(lock)} Your staged car is ${CAR_TYPE_LABEL[getCar(staged.carId).type]}.`
      }
      const cost = mod.fuelCost ?? 0
      if (staged && cost > staged.fuel) return `Needs ${cost} fuel on your staged car.`
      if (mod.effects.some((effect) => effect.kind === 'moveAllFuel')) {
        return me.garage.length < 2 ? 'Needs two cars.' : 'No car with fuel to move.'
      }
      return 'Not playable now.'
    }
    case 'sabotage':
      return turn.sabotagePlayed >= TUNABLES.sabotagePerTurn
        ? 'One Sabotage per turn, already played.'
        : 'Not playable now.'
  }
}

const STAGING_NOTE = 'Cards play in the mod step, after staging and fuel.'
const FUEL_NOTE = 'Cards play in the mod step, after fuel.'
const ADVANCE_NOTE = 'The mod step is over this turn.'

/** A note for the hand header on the viewer's own turn when cards cannot be played yet. */
export function handNote(state: MatchState, viewer: PlayerIndex): string | null {
  if (currentPlayer(state) !== viewer) return null
  if (state.phase.kind === 'staging') return STAGING_NOTE
  if (state.phase.kind !== 'turn') return null
  switch (state.turn.step) {
    case 'fuel':
      return FUEL_NOTE
    case 'mods':
      return null
    case 'advance':
      return ADVANCE_NOTE
  }
}

/**
 * The answer to a tap on a hand card that cannot be played (DESIGN.md 8, Refused plays): which
 * card and why, in the words the hand header and the faded card use. A card or a Sponsor pick
 * waiting for the player comes first, then whose turn it is, the phase, the step, and in the mod
 * step the card's own reason.
 */
export function whyNotPlayable(
  state: MatchState,
  viewer: PlayerIndex,
  modId: string,
  selection: Selection,
  options: readonly Action[] | null,
  names: readonly [string, string],
): string {
  if (selection.kind !== 'none') {
    const waiting = getMod(selection.modId).name
    return `${waiting} is waiting for a car. Choose one with the pink outline, or Cancel.`
  }
  const option = options?.[0]
  if (option) {
    const waiting = 'modId' in option ? getMod(option.modId).name : 'Your card'
    return `${waiting} is waiting for your pick. Choose a Part above, or Cancel.`
  }
  const lead = `${getMod(modId).name} cannot be played now.`
  const acting = currentPlayer(state)
  if (acting === null) return `${lead} The match is over.`
  if (acting !== viewer) {
    return `${lead} Waiting for ${names[acting]}; cards play in your own mod step.`
  }
  const { phase } = state
  if (phase.kind === 'staging') return `${lead} ${STAGING_NOTE}`
  if (phase.kind !== 'turn') return `${lead} Parts Thief first: choose a Part to give up.`
  switch (state.turn.step) {
    case 'fuel':
      return `${lead} ${FUEL_NOTE}`
    case 'advance':
      return `${lead} ${ADVANCE_NOTE}`
    case 'mods':
      return `${lead} ${blockedReason(state, viewer, modId) ?? 'Not playable now.'}`
  }
}

/**
 * The answer to a tap on a car that is not a target for the card just picked: a Part or Tow
 * Truck on the other garage's car, a car with no open slot, a car with no fuel to move, or the
 * same car twice. Null with no selection, when every own car already answers a tap.
 */
export function whyNotTarget(
  viewer: PlayerIndex,
  selection: Selection,
  carId: string,
  owner: PlayerIndex,
): string | null {
  if (selection.kind === 'none') return null
  const mod = getMod(selection.modId)
  const car = getCar(carId)
  if (mod.family === 'part') {
    if (owner !== viewer) return `${mod.name} goes on your own cars.`
    return `The ${car.name} has no open Part slot. Cars hold ${TUNABLES.partSlots} Parts, JDM ${TUNABLES.partSlotsJdm}.`
  }
  if (owner !== viewer) return `${mod.name} moves fuel between your own cars.`
  if (selection.kind === 'towFrom') return 'Choose a different car to receive the fuel.'
  return `The ${car.name} has no fuel to move.`
}

export interface LaneNote {
  text: string
  tone: 'boost' | 'sabotage'
}

interface AdvanceContext {
  firstAdvance: boolean
  startFt: number
}

/**
 * What is in effect on a player's lane: sabotage waiting on their staged car's next advance,
 * a Roadblock on their Boosts, and on their own turn the Boosts they have played, each with
 * what it does to the coming advance.
 */
export function laneNotes(state: MatchState, player: PlayerIndex): LaneNote[] {
  const notes: LaneNote[] = []
  const me = state.players[player]
  const pending = me.pendingSabotage
  if (pending.skipAdvance) {
    notes.push({ text: 'Skips its next advance', tone: 'sabotage' })
  } else {
    const cuts: string[] = []
    if (pending.flatReductionFt > 0) cuts.push(`−${pending.flatReductionFt} ft`)
    if (pending.halve) cuts.push('halved')
    if (cuts.length > 0) notes.push({ text: `Next advance ${cuts.join(', ')}`, tone: 'sabotage' })
  }
  const turn = state.phase.kind === 'turn' && state.turn.player === player ? state.turn : null
  if (turn?.boostBlocked) notes.push({ text: 'No Boost this turn', tone: 'sabotage' })
  if (me.boostBlockedNextTurn) notes.push({ text: 'No Boost next turn', tone: 'sabotage' })
  if (turn) {
    const context = {
      firstAdvance: state.race.advances[player] === 0,
      startFt: state.race.distanceFt[player],
    }
    for (const [modId, heads] of boostsThisTurn(state.log, player)) {
      const mod = getMod(modId)
      const text = boostSummary(mod.effects, heads, context)
      if (text) notes.push({ text: `${mod.name} ${text}`, tone: 'boost' })
    }
  }
  return notes
}

/** Boosts played since the last turn began, each with its coin flip result when it had one. */
function boostsThisTurn(
  log: readonly LogEntry[],
  player: PlayerIndex,
): [modId: string, heads: boolean | null][] {
  let start = 0
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.kind === 'turnStart') {
      start = i + 1
      break
    }
  }
  const entries = log.slice(start)
  const boosts: [string, boolean | null][] = []
  entries.forEach((entry, i) => {
    if (entry.kind !== 'playBoost' || entry.player !== player) return
    const flip = entries
      .slice(i + 1)
      .find((e) => e.kind === 'coinFlip' && e.purpose === 'mod' && e.modId === entry.modId)
    boosts.push([
      entry.modId,
      flip?.kind === 'coinFlip' && flip.purpose === 'mod' ? flip.heads : null,
    ])
  })
  return boosts
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

/** What a Boost's effects do to the coming advance, in a few words. Empty for one-off effects. */
function boostSummary(
  effects: readonly ModEffect[],
  heads: boolean | null,
  context: AdvanceContext,
): string {
  const bits: string[] = []
  for (const effect of effects) {
    switch (effect.kind) {
      case 'hpPercent':
        bits.push(`+${percent(effect.value)} hp`)
        break
      case 'hpPercentPerPart':
        bits.push(`+${percent(effect.value)} hp per Part`)
        break
      case 'flatDistance': {
        const { window } = effect
        if (windowApplies(window, context.startFt, context.firstAdvance)) {
          bits.push(`+${effect.ft} ft`)
        } else if (window.when === 'fromDistance') {
          bits.push(`no effect before ${window.minStartFt} ft`)
        } else {
          bits.push('no effect, not a first advance')
        }
        break
      }
      case 'distancePercent':
        bits.push(`+${percent(effect.value)}`)
        break
      case 'extraAdvance':
        bits.push(
          effect.distanceMultiplier === 0.5
            ? 'second advance at half distance'
            : `second advance at ${percent(effect.distanceMultiplier)} distance`,
        )
        break
      case 'tractionShield':
        bits.push('shielded from Traction')
        break
      case 'addWear':
        if (effect.target === 'self') bits.push(`+${effect.count} wear after`)
        break
      case 'coinFlip': {
        if (heads === null) break
        const side = heads ? 'heads' : 'tails'
        const inner = boostSummary(heads ? effect.heads : effect.tails, null, context)
        bits.push(`${side}: ${inner || 'nothing'}`)
        break
      }
      default:
        break
    }
  }
  return bits.join(', ')
}

function signed(ft: number): string {
  return ft < 0 ? `−${-ft}` : `+${ft}`
}

/**
 * What changed an advance's distance, for its log line: base feet, then only the steps that
 * moved the number. Empty when nothing did, so a plain advance reads as it always has.
 */
export function advanceSuffix(breakdown: AdvanceBreakdown): string {
  const b = breakdown
  const plain = b.baseFt + b.typeBonusFt + b.modBonusFt
  const parts: string[] = []
  if (b.typeBonusFt !== 0) parts.push(`${signed(b.typeBonusFt)} ft type`)
  if (b.modBonusFt !== 0) parts.push(`${signed(b.modBonusFt)} ft mods`)
  if (plain > 0 && b.beforeSabotageFt !== plain) {
    parts.push(`+${percent(b.beforeSabotageFt / plain - 1)} boost`)
  }
  if (b.afterSabotageFt !== b.beforeSabotageFt) {
    parts.push(`−${b.beforeSabotageFt - b.afterSabotageFt} ft sabotage`)
  }
  if (b.wearMultiplier !== 1) parts.push(`×${b.wearMultiplier} wear`)
  if (parts.length === 0) return ''
  return [`base ${b.baseFt} ft`, ...parts].join(', ')
}
