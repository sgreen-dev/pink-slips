import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import type { Mod, ModEffect } from '../data/types.ts'
import type { CoinFlips } from './levels.ts'
import {
  computeAdvance,
  fuelCost,
  isTractionImmune,
  otherPlayer,
  partModifiers,
  stagedCar,
  TUNABLES,
  windowApplies,
  type Action,
  type CarState,
  type MatchState,
  type PlayerIndex,
  type WindowedBonus,
} from '../engine/index.ts'

/**
 * Forecasts the CPU reasons with. Everything here reads only what a human at the table could
 * see: garages, fuel, parts, wear, distances, pending sabotage, and the CPU's own hand. Coin
 * flips are read as tails unless the Sports identity makes heads certain, or at their expected
 * value when the level asks for it, and the opponent's hand is assumed empty.
 */

/** What one card would do, read conservatively from its effect descriptors. */
export interface CardEstimate {
  hpPercent: number
  hpPercentPerPart: number
  weightReductionLb: number
  flatBonuses: WindowedBonus[]
  distancePercent: number
  extraAdvanceMultiplier: number | null
  shield: boolean
  /** Fuel the player's staged car gains when the card is played. */
  ownFuelDelta: number
  /** Wear the player's staged car takes after advancing. */
  ownWear: number
  /** Fuel the opponent's staged car loses. */
  opponentFuelLoss: number
  opponentWear: number
  flatReductionFt: number
  halve: boolean
  skip: boolean
  removesPart: boolean
  blocksBoost: boolean
  draws: number
  searchesPart: boolean
}

export function emptyEstimate(): CardEstimate {
  return {
    hpPercent: 0,
    hpPercentPerPart: 0,
    weightReductionLb: 0,
    flatBonuses: [],
    distancePercent: 0,
    extraAdvanceMultiplier: null,
    shield: false,
    ownFuelDelta: 0,
    ownWear: 0,
    opponentFuelLoss: 0,
    opponentWear: 0,
    flatReductionFt: 0,
    halve: false,
    skip: false,
    removesPart: false,
    blocksBoost: false,
    draws: 0,
    searchesPart: false,
  }
}

interface EstimateContext {
  /** True when the first coin flip this card makes is certain to be heads. */
  forcedHeads: boolean
  /** The action that would play the card, for Tow Truck's source and destination. */
  action?: Action
  /** The player's garage, to read how much fuel Tow Truck would move. */
  garage: readonly CarState[]
  stagedCarId: string | null
  /** How coin flips are read: the tails branch, or the average of both. */
  coinFlips?: CoinFlips
}

/** Adds a weighted share of one estimate to another, for reading a coin flip at its average. */
function merge(into: CardEstimate, from: CardEstimate, weight: number): void {
  into.hpPercent += from.hpPercent * weight
  into.hpPercentPerPart += from.hpPercentPerPart * weight
  into.weightReductionLb += from.weightReductionLb * weight
  into.distancePercent += from.distancePercent * weight
  into.ownFuelDelta += from.ownFuelDelta * weight
  into.ownWear += from.ownWear * weight
  into.opponentFuelLoss += from.opponentFuelLoss * weight
  into.opponentWear += from.opponentWear * weight
  into.flatReductionFt += from.flatReductionFt * weight
  into.draws += from.draws * weight
  for (const bonus of from.flatBonuses) {
    into.flatBonuses.push({ ft: bonus.ft * weight, window: bonus.window })
  }
  if (from.extraAdvanceMultiplier !== null) {
    into.extraAdvanceMultiplier =
      (into.extraAdvanceMultiplier ?? 0) + from.extraAdvanceMultiplier * weight
  }
  into.shield ||= from.shield
  into.halve ||= from.halve
  into.skip ||= from.skip
  into.removesPart ||= from.removesPart
  into.blocksBoost ||= from.blocksBoost
  into.searchesPart ||= from.searchesPart
}

export function estimateEffects(
  effects: readonly ModEffect[],
  context: EstimateContext,
): CardEstimate {
  const estimate = emptyEstimate()
  let forcedHeads = context.forcedHeads
  const visit = (list: readonly ModEffect[]) => {
    for (const effect of list) {
      switch (effect.kind) {
        case 'hpPercent':
          estimate.hpPercent += effect.value
          break
        case 'hpPercentPerPart':
          estimate.hpPercentPerPart += effect.value
          break
        case 'weightReduction':
          estimate.weightReductionLb += effect.lb
          break
        case 'flatDistance':
          estimate.flatBonuses.push({ ft: effect.ft, window: effect.window })
          break
        case 'distancePercent':
          estimate.distancePercent += effect.value
          break
        case 'extraAdvance':
          estimate.extraAdvanceMultiplier = effect.distanceMultiplier
          break
        case 'tractionShield':
          estimate.shield = true
          break
        case 'addWear':
          if (effect.target === 'self') estimate.ownWear += effect.count
          else estimate.opponentWear += effect.count
          break
        case 'addFuel':
          estimate.ownFuelDelta += effect.count
          break
        case 'extraFuelPlacement':
          // The CPU places owed fuel on its staged car when that car is short.
          estimate.ownFuelDelta += effect.count
          break
        case 'moveAllFuel': {
          const action = context.action
          if (action?.type !== 'playBoost' || !action.fromCarId || !action.toCarId) break
          const from = context.garage.find((car) => car.carId === action.fromCarId)
          const moved = from?.fuel ?? 0
          if (action.toCarId === context.stagedCarId) estimate.ownFuelDelta += moved
          if (action.fromCarId === context.stagedCarId) estimate.ownFuelDelta -= moved
          break
        }
        case 'removeFuel':
          estimate.opponentFuelLoss += effect.count
          break
        case 'reduceDistance':
          estimate.flatReductionFt += effect.ft
          break
        case 'halveDistance':
          estimate.halve = true
          break
        case 'skipAdvance':
          estimate.skip = true
          break
        case 'discardPart':
          estimate.removesPart = true
          break
        case 'blockBoost':
          estimate.blocksBoost = true
          break
        case 'draw':
          estimate.draws += effect.count
          break
        case 'searchDeck':
          estimate.searchesPart = effect.family === 'part'
          break
        case 'coinFlip': {
          if (forcedHeads) {
            forcedHeads = false
            visit(effect.heads)
          } else if (context.coinFlips === 'expected') {
            const branch = { ...context, forcedHeads: false }
            merge(estimate, estimateEffects(effect.heads, branch), 0.5)
            merge(estimate, estimateEffects(effect.tails, branch), 0.5)
          } else {
            visit(effect.tails)
          }
          break
        }
        case 'fuelCostDelta':
        case 'noWearFromWinning':
        case 'tractionImmunity':
          break
      }
    }
  }
  visit(effects)
  return estimate
}

/** Whether the next coin flip this player's staged car makes is certain to be heads. */
export function forcedHeads(state: MatchState, player: PlayerIndex): boolean {
  const staged = stagedCar(state, player)
  return (
    staged !== null && getCar(staged.carId).type === 'sports' && state.race.coinFlips[player] === 0
  )
}

export function estimateCard(
  state: MatchState,
  player: PlayerIndex,
  mod: Mod,
  action?: Action,
  coinFlips: CoinFlips = 'tails',
): CardEstimate {
  const p = state.players[player]
  return estimateEffects(mod.effects, {
    forcedHeads: forcedHeads(state, player),
    action,
    garage: p.garage,
    stagedCarId: p.stagedCarId,
    coinFlips,
  })
}

function sumWindowed(bonuses: readonly WindowedBonus[], startFt: number, isFirst: boolean): number {
  return bonuses
    .filter((bonus) => windowApplies(bonus.window, startFt, isFirst))
    .reduce((sum, bonus) => sum + bonus.ft, 0)
}

/** The distance a car would cover on its first advance of a race from a standing start. */
export function readyAdvance(car: CarState): number {
  const parts = partModifiers(car)
  return computeAdvance({
    car: getCar(car.carId),
    wear: car.wear,
    startFt: 0,
    isFirstAdvanceOfRace: true,
    hpPercent: parts.hpPercent,
    weightReductionLb: parts.weightReductionLb,
    flatBonusFt: sumWindowed(parts.flatBonuses, 0, true),
  }).finalFt
}

/** Fuel a car still needs before it can advance. */
export function fuelNeeded(car: CarState): number {
  return Math.max(0, fuelCost(car) - car.fuel)
}

/** How much a Part is worth on a car: feet added to a standing-start advance plus utility. */
export function partValue(car: CarState, modId: string): number {
  const without = { ...car, parts: car.parts.filter((id) => id !== modId) }
  const withPart = { ...car, parts: [...without.parts, modId] }
  let value = readyAdvance(withPart) - readyAdvance(without)
  for (const effect of getMod(modId).effects) {
    switch (effect.kind) {
      case 'flatDistance':
        // A bonus that only applies past a distance is worth about half its face on average.
        if (effect.window.when === 'fromDistance') value += effect.ft * 0.5
        break
      case 'fuelCostDelta':
        if (fuelCost(withPart) < fuelCost(without)) value += VALUE.fuelCostPoint
        break
      case 'noWearFromWinning':
        value += VALUE.rollCage
        break
      case 'tractionImmunity':
        if (getCar(car.carId).type !== 'offroad') value += VALUE.tractionImmunity
        break
      default:
        break
    }
  }
  return value
}

/** The attached Part the car's owner would give up first. */
export function weakestPart(car: CarState): string | null {
  let weakest: string | null = null
  let lowest = Infinity
  for (const modId of new Set(car.parts)) {
    const value = partValue(car, modId)
    if (value < lowest) {
      lowest = value
      weakest = modId
    }
  }
  return weakest
}

export interface Forecast {
  canAdvance: boolean
  ft: number
  toFt: number
  wins: boolean
}

const NO_ADVANCE = (startFt: number): Forecast => ({
  canAdvance: false,
  ft: 0,
  toFt: startFt,
  wins: false,
})

/** The advance the player's staged car makes if its mod step ended now, plus an optional card. */
export function forecastOwnAdvance(
  state: MatchState,
  player: PlayerIndex,
  candidate?: { mod: Mod; action: Action },
  coinFlips: CoinFlips = 'tails',
): Forecast {
  const staged = stagedCar(state, player)
  const startFt = state.race.distanceFt[player]
  if (!staged) return NO_ADVANCE(startFt)
  const car = getCar(staged.carId)
  const estimate = candidate
    ? estimateCard(state, player, candidate.mod, candidate.action, coinFlips)
    : emptyEstimate()
  const cardFuelCost = candidate?.mod.family === 'boost' ? (candidate.mod.fuelCost ?? 0) : 0
  const fuel = staged.fuel - cardFuelCost + estimate.ownFuelDelta
  const pending = state.players[player].pendingSabotage
  const shielded = isTractionImmune(staged) || staged.tractionShield || estimate.shield
  const skipped = pending.skipAdvance && !shielded
  if (state.turn.number === 1 || fuel < fuelCost(staged) || skipped) return NO_ADVANCE(startFt)

  const parts = partModifiers(staged)
  const mods = state.turn.advance
  const isFirst = state.race.advances[player] === 0
  const first = computeAdvance({
    car,
    wear: staged.wear,
    startFt,
    isFirstAdvanceOfRace: isFirst,
    hpPercent:
      parts.hpPercent +
      mods.hpPercent +
      estimate.hpPercent +
      (mods.hpPercentPerPart + estimate.hpPercentPerPart) * staged.parts.length,
    weightReductionLb:
      parts.weightReductionLb + mods.weightReductionLb + estimate.weightReductionLb,
    flatBonusFt: sumWindowed(
      [...parts.flatBonuses, ...mods.flatBonuses, ...estimate.flatBonuses],
      startFt,
      isFirst,
    ),
    distancePercent: mods.distancePercent + estimate.distancePercent,
    sabotage: shielded
      ? undefined
      : { flatReductionFt: pending.flatReductionFt, halve: pending.halve },
  })
  let ft = first.finalFt
  const extra = estimate.extraAdvanceMultiplier ?? mods.extraAdvanceMultiplier
  if (extra !== null && startFt + ft < TUNABLES.trackLengthFt) {
    const secondStart = startFt + ft
    ft += computeAdvance({
      car,
      wear: staged.wear + mods.wearAfterAdvance + estimate.ownWear,
      startFt: secondStart,
      isFirstAdvanceOfRace: false,
      hpPercent: parts.hpPercent,
      weightReductionLb: parts.weightReductionLb,
      flatBonusFt: sumWindowed(parts.flatBonuses, secondStart, false),
      finalMultiplier: extra,
    }).finalFt
  }
  const toFt = startFt + ft
  return { canAdvance: true, ft, toFt, wins: toFt >= TUNABLES.trackLengthFt }
}

/**
 * The advance the opponent's staged car makes on its next turn, assuming they fuel it if it is
 * short and play nothing, with an optional Sabotage from the player's hand applied first.
 */
export function forecastOpponentAdvance(
  state: MatchState,
  player: PlayerIndex,
  sabotage?: Mod,
  coinFlips: CoinFlips = 'tails',
): Forecast {
  const opponent = otherPlayer(player)
  const staged = stagedCar(state, opponent)
  const startFt = state.race.distanceFt[opponent]
  if (!staged) return NO_ADVANCE(startFt)
  const estimate = sabotage
    ? estimateCard(state, player, sabotage, undefined, coinFlips)
    : emptyEstimate()
  const fuelNow = Math.max(0, staged.fuel - estimate.opponentFuelLoss)
  const cost = fuelCost(staged)
  const fuel = fuelNow < cost ? fuelNow + 1 : fuelNow
  const pending = state.players[opponent].pendingSabotage
  const shielded = isTractionImmune(staged) || staged.tractionShield
  const isFirst = state.race.advances[opponent] === 0
  const skipped = !shielded && (pending.skipAdvance || (estimate.skip && isFirst))
  if (fuel < cost || skipped) return NO_ADVANCE(startFt)

  let car = staged
  if (estimate.removesPart) {
    const lost = weakestPart(staged)
    if (lost !== null) car = { ...staged, parts: staged.parts.filter((id) => id !== lost) }
  }
  const parts = partModifiers(car)
  const result = computeAdvance({
    car: getCar(car.carId),
    wear: car.wear + estimate.opponentWear,
    startFt,
    isFirstAdvanceOfRace: isFirst,
    hpPercent: parts.hpPercent,
    weightReductionLb: parts.weightReductionLb,
    flatBonusFt: sumWindowed(parts.flatBonuses, startFt, isFirst),
    sabotage: shielded
      ? undefined
      : {
          flatReductionFt: pending.flatReductionFt + estimate.flatReductionFt,
          halve: pending.halve || estimate.halve,
        },
  })
  const toFt = startFt + result.finalFt
  return { canAdvance: true, ft: result.finalFt, toFt, wins: toFt >= TUNABLES.trackLengthFt }
}

/** Feet of an advance that matter: nothing past the finish line counts. */
export function usefulFt(forecast: Forecast, startFt: number): number {
  return Math.min(forecast.ft, Math.max(0, TUNABLES.trackLengthFt - startFt))
}

/**
 * Heuristic worth of things that are not distance, in feet. These shape how eagerly the CPU
 * spends cards; the simulator in phase 5 is the judge of them.
 */
export const VALUE = {
  /** One fuel token. */
  fuel: 60,
  /** One card drawn. */
  card: 30,
  /** A Part fetched from the deck when a car has a slot for it. */
  sponsor: 60,
  /** Lowering a car's fuel cost by one. */
  fuelCostPoint: 120,
  rollCage: 50,
  tractionImmunity: 40,
  /** A wear point on a car, in feet of future advances lost. */
  wearPoint: 40,
  /** Denying the opponent a Boost on a turn they can advance. */
  roadblock: 50,
  /** Minimum worth before the CPU spends a Boost or Sabotage outside the win-and-stop rules. */
  playThreshold: 50,
  /** One turn taken off the CPU's own finish, or added to the opponent's, for Pro. */
  turn: 200,
} as const
