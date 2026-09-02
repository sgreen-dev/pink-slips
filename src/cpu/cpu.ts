import { getMod } from '../data/mods.ts'
import {
  legalActions,
  nextInt,
  seedRng,
  stagedCar,
  type Action,
  type CarState,
  type MatchState,
  type PlayerIndex,
  type RngState,
} from '../engine/index.ts'
import {
  estimateCard,
  forecastOpponentAdvance,
  forecastOwnAdvance,
  fuelNeeded,
  partValue,
  readyAdvance,
  usefulFt,
  VALUE,
  type Forecast,
} from './predict.ts'

/**
 * The CPU opponent (DESIGN.md section 6). Rule based, drives the engine through legalActions
 * and apply only, and never looks at anything a human at the table could not see. Given the
 * same state and seed it always returns the same action; the seed only breaks exact ties.
 */

/** Picks the item with the lexicographically highest score. Exact ties are broken by the rng. */
function best<T>(items: readonly T[], score: (item: T) => readonly number[], rng: RngState): T {
  let winners: T[] = []
  let top: readonly number[] | null = null
  for (const item of items) {
    const s = score(item)
    const cmp = top === null ? 1 : compare(s, top)
    if (cmp > 0) {
      top = s
      winners = [item]
    } else if (cmp === 0) {
      winners.push(item)
    }
  }
  const [index] = nextInt(rng, winners.length)
  const chosen = winners[index]
  if (chosen === undefined) throw new Error('Nothing to choose from')
  return chosen
}

function compare(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}

function tieBreaker(state: MatchState, seed: number): RngState {
  return seedRng((Math.imul(seed, 2654435761) + state.log.length * 40503) >>> 0)
}

export function chooseAction(state: MatchState, player: PlayerIndex, seed = 0): Action {
  const actions = legalActions(state, player)
  const first = actions[0]
  if (!first) throw new Error(`Player ${player + 1} has no legal action`)
  const rng = tieBreaker(state, seed)
  switch (state.phase.kind) {
    case 'staging':
      return chooseStage(state, player, actions, rng)
    case 'choice':
      return chooseDiscard(state, player, actions, rng)
    case 'over':
      throw new Error('The match is over')
    case 'turn':
      break
  }
  switch (state.turn.step) {
    case 'fuel':
      return chooseFuel(state, player, actions, rng)
    case 'mods':
      return chooseMod(state, player, actions, rng)
    case 'advance':
      return first
  }
}

function carOf(state: MatchState, player: PlayerIndex, carId: string): CarState {
  const car = state.players[player].garage.find((c) => c.carId === carId)
  if (!car) throw new Error(`No car ${carId}`)
  return car
}

/** Priority 5: stage the car with the highest ready advance, preferring lower wear. */
function chooseStage(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
): Action {
  const current = state.players[player].stagedCarId
  const stages = actions.filter((a) => a.type === 'stage')
  return best(
    stages,
    (action) => {
      const car = carOf(state, player, action.carId)
      const needed = fuelNeeded(car)
      const advance = readyAdvance(car)
      return [
        needed === 0 ? 1 : 0,
        needed === 0 ? advance : -needed,
        advance,
        -car.wear,
        action.carId === current ? 1 : 0,
      ]
    },
    rng,
  )
}

/** Parts Thief: give up the Part worth the least on that car. */
function chooseDiscard(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
): Action {
  if (state.phase.kind !== 'choice') throw new Error('No choice pending')
  const car = carOf(state, player, state.phase.choice.carId)
  const discards = actions.filter((a) => a.type === 'discardPart')
  return best(discards, (action) => [-partValue(car, action.modId)], rng)
}

/**
 * Priority 3: fuel the staged car when it is under its cost, otherwise the garage car with the
 * best advance per fuel it still needs. When every car is ready, top up the staged car so
 * fuel-cost Boosts stay available.
 */
function chooseFuel(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
): Action {
  const fuels = actions.filter((a) => a.type === 'fuel')
  const staged = stagedCar(state, player)
  if (staged && fuelNeeded(staged) > 0) {
    const own = fuels.find((a) => a.carId === staged.carId)
    if (own) return own
  }
  const short = fuels.filter((a) => fuelNeeded(carOf(state, player, a.carId)) > 0)
  if (short.length > 0) {
    return best(
      short,
      (action) => {
        const car = carOf(state, player, action.carId)
        return [readyAdvance(car) / fuelNeeded(car), -car.wear]
      },
      rng,
    )
  }
  return best(
    fuels,
    (action) => [
      action.carId === staged?.carId ? 1 : 0,
      readyAdvance(carOf(state, player, action.carId)),
    ],
    rng,
  )
}

interface BoostPlay {
  action: Action & { type: 'playBoost' }
  forecast: Forecast
}

interface SabotagePlay {
  action: Action & { type: 'playSabotage' }
  forecast: Forecast
}

/** Worth of a Boost beyond the win rule: extra useful feet plus fuel, cards, and wear costs. */
function boostValue(
  state: MatchState,
  player: PlayerIndex,
  play: BoostPlay,
  baseline: Forecast,
): number {
  const mod = getMod(play.action.modId)
  const estimate = estimateCard(state, player, mod, play.action)
  const startFt = state.race.distanceFt[player]
  let value = usefulFt(play.forecast, startFt) - usefulFt(baseline, startFt)
  if (baseline.canAdvance && !play.forecast.canAdvance) value -= VALUE.fuel * 10
  const fuelSpent = mod.family === 'boost' ? (mod.fuelCost ?? 0) : 0
  value -= fuelSpent * VALUE.fuel
  value -= estimate.ownWear * VALUE.wearPoint
  // Fuel the card adds stays useful even when the car could already advance.
  if (estimate.ownFuelDelta > 0 && baseline.canAdvance) value += estimate.ownFuelDelta * VALUE.fuel
  value += estimate.draws * VALUE.card
  if (estimate.searchesPart && play.action.targetModId) value += VALUE.sponsor
  return value
}

/** Worth of a Sabotage beyond the stop rule: useful feet taken away plus lasting damage. */
function sabotageValue(
  state: MatchState,
  player: PlayerIndex,
  play: SabotagePlay,
  baseline: Forecast,
): number {
  const opponent: PlayerIndex = player === 0 ? 1 : 0
  const target = stagedCar(state, opponent)
  if (!target) return 0
  const mod = getMod(play.action.modId)
  const estimate = estimateCard(state, player, mod)
  const startFt = state.race.distanceFt[opponent]
  let value = usefulFt(baseline, startFt) - usefulFt(play.forecast, startFt)
  value += estimate.opponentWear * VALUE.wearPoint
  if (estimate.removesPart) {
    const weakest = [...new Set(target.parts)]
      .map((id) => partValue(target, id))
      .sort((a, b) => a - b)[0]
    value += weakest ?? 0
  }
  if (estimate.blocksBoost && baseline.canAdvance) value += VALUE.roadblock
  if (estimate.opponentFuelLoss > 0 && !baseline.canAdvance) value += VALUE.fuel / 2
  return value
}

/** The mod step: priorities 4, 1, and 2, then the fallbacks, then end the step. */
function chooseMod(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
): Action {
  if (state.turn.extraFuel > 0) return chooseFuel(state, player, actions, rng)

  // Priority 4: attach Parts to the car with the most races likely left in it.
  const parts = actions
    .filter((a) => a.type === 'playPart')
    .map((action) => ({ action, car: carOf(state, player, action.carId) }))
    .map((play) => ({ ...play, value: partValue(play.car, play.action.modId) }))
    .filter((play) => play.value > 0)
  if (parts.length > 0) {
    return best(parts, (play) => [-play.car.wear, play.value, readyAdvance(play.car)], rng).action
  }

  const baseline = forecastOwnAdvance(state, player)
  const boosts: BoostPlay[] = actions
    .filter((a) => a.type === 'playBoost')
    .map((action) => ({
      action,
      forecast: forecastOwnAdvance(state, player, { mod: getMod(action.modId), action }),
    }))

  // Priority 1: a Boost that wins this advance.
  if (!baseline.wins) {
    const winning = boosts.filter((play) => play.forecast.wins)
    if (winning.length > 0) {
      return best(
        winning,
        (play) => {
          const mod = getMod(play.action.modId)
          const estimate = estimateCard(state, player, mod, play.action)
          return [-(mod.family === 'boost' ? (mod.fuelCost ?? 0) : 0), -estimate.ownWear]
        },
        rng,
      ).action
    }
  }

  // Priority 2: a Sabotage that stops the opponent winning on their next advance.
  const opponentBaseline = forecastOpponentAdvance(state, player)
  const sabotages: SabotagePlay[] = actions
    .filter((a) => a.type === 'playSabotage')
    .map((action) => ({
      action,
      forecast: forecastOpponentAdvance(state, player, getMod(action.modId)),
    }))
  if (opponentBaseline.wins) {
    const stoppers = sabotages.filter((play) => !play.forecast.wins)
    if (stoppers.length > 0) return best(stoppers, (play) => [-play.forecast.ft], rng).action
  }

  // Fallbacks: spend a Boost or Sabotage worth at least the threshold.
  const valuedBoosts = boosts
    .map((play) => ({ play, value: boostValue(state, player, play, baseline) }))
    .filter(({ value }) => value >= VALUE.playThreshold)
  if (valuedBoosts.length > 0) return best(valuedBoosts, ({ value }) => [value], rng).play.action

  const valuedSabotage = sabotages
    .map((play) => ({ play, value: sabotageValue(state, player, play, opponentBaseline) }))
    .filter(({ value }) => value >= VALUE.playThreshold)
  if (valuedSabotage.length > 0) {
    return best(valuedSabotage, ({ value }) => [value], rng).play.action
  }

  const end = actions.find((a) => a.type === 'endMods')
  if (!end) throw new Error('Cannot end the mod step')
  return end
}
