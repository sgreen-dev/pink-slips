import { getMod } from '../data/mods.ts'
import {
  legalActions,
  nextInt,
  otherPlayer,
  seedRng,
  stagedCar,
  TUNABLES,
  type Action,
  type CarState,
  type MatchState,
  type PlayerIndex,
  type RngState,
} from '../engine/index.ts'
import { profileFor, type Level, type Profile } from './levels.ts'
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
 * same state, seed, and level it always returns the same action; the seed only breaks exact
 * ties. The level is a profile of switches, read here and nowhere else.
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

export function chooseAction(
  state: MatchState,
  player: PlayerIndex,
  seed = 0,
  level: Level = 'street',
): Action {
  const actions = legalActions(state, player)
  const first = actions[0]
  if (!first) throw new Error(`Player ${player + 1} has no legal action`)
  const rng = tieBreaker(state, seed)
  const profile = profileFor(level)
  switch (state.phase.kind) {
    case 'staging':
      return chooseStage(state, player, actions, rng, profile)
    case 'choice':
      return chooseDiscard(state, player, actions, rng)
    case 'over':
      throw new Error('The match is over')
    case 'turn':
      break
  }
  switch (state.turn.step) {
    case 'fuel':
      return chooseFuel(state, player, actions, rng, profile)
    case 'mods':
      return chooseMod(state, player, actions, rng, profile)
    case 'advance':
      return first
  }
}

function carOf(state: MatchState, player: PlayerIndex, carId: string): CarState {
  const car = state.players[player].garage.find((c) => c.carId === carId)
  if (!car) throw new Error(`No car ${carId}`)
  return car
}

/**
 * Priority 5: stage the car with the highest ready advance, preferring lower wear. Rookie
 * looks only at the advance, so it will stage a car that cannot move yet.
 */
function chooseStage(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
  profile: Profile,
): Action {
  const current = state.players[player].stagedCarId
  const stages = actions.filter((a) => a.type === 'stage')
  if (profile.stageByAdvanceOnly) {
    return best(stages, (action) => [readyAdvance(carOf(state, player, action.carId))], rng)
  }
  if (profile.stageByTurns) {
    // Staging second, Pro can see the opponent's car: race the weakest car that still finishes
    // first with a turn to spare, and keep the strong cars unworn for the races that need them.
    const rival = stagedCar(state, otherPlayer(player))
    const rivalTurns = rival ? turnsFromStart(rival) : null
    const movesFirst = state.turn.player === player
    return best(
      stages,
      (action) => {
        const car = carOf(state, player, action.carId)
        const turns = turnsFromStart(car)
        if (rivalTurns !== null) {
          const margin = rivalTurns - turns + (movesFirst ? 0 : -1)
          if (margin >= 1) return [2, -readyAdvance(car), -car.wear]
          if (margin >= 0) return [1, -turns, -car.wear, readyAdvance(car)]
        }
        return [0, -turns, -car.wear, readyAdvance(car), action.carId === current ? 1 : 0]
      },
      rng,
    )
  }
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

/** Turns a car needs to finish a race from a standing start, fueling included. */
function turnsFromStart(car: CarState): number {
  return fuelNeeded(car) + Math.ceil(TUNABLES.trackLengthFt / Math.max(1, readyAdvance(car)))
}

/**
 * Turns to cover the remaining feet when the next advance is one length and the ones after it
 * another. Infinity when the car cannot get there.
 */
function turnsToFinish(remainingFt: number, nextFt: number, laterFt: number): number {
  if (remainingFt <= 0) return 0
  if (nextFt >= remainingFt) return 1
  if (laterFt <= 0) return Infinity
  return 1 + Math.ceil((remainingFt - nextFt) / laterFt)
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
 * Turns the current race has left, read from both staged cars: fuel each still needs plus the
 * advances it needs from where it stands. The sooner car sets the clock.
 */
function turnsLeftInRace(state: MatchState, player: PlayerIndex): number {
  const turns = (p: PlayerIndex): number => {
    const car = stagedCar(state, p)
    if (!car) return Infinity
    const remaining = TUNABLES.trackLengthFt - state.race.distanceFt[p]
    return fuelNeeded(car) + Math.ceil(remaining / Math.max(1, readyAdvance(car)))
  }
  return Math.max(1, Math.min(turns(player), turns(otherPlayer(player))))
}

/**
 * Priority 3: fuel the staged car when it is under its cost, otherwise the garage car with the
 * best advance per fuel it still needs. Pro first asks whether a bench car can be ready by the
 * time this race ends, so fuel is not stranded on a car the next race cannot use. When every
 * car is ready, top up the staged car so fuel-cost Boosts stay available.
 */
function chooseFuel(
  state: MatchState,
  player: PlayerIndex,
  actions: Action[],
  rng: RngState,
  profile: Profile,
): Action {
  const fuels = actions.filter((a) => a.type === 'fuel')
  const staged = stagedCar(state, player)
  if (staged && fuelNeeded(staged) > 0) {
    const own = fuels.find((a) => a.carId === staged.carId)
    if (own) return own
  }
  const short = fuels.filter((a) => fuelNeeded(carOf(state, player, a.carId)) > 0)
  if (short.length > 0) {
    const turnsLeft = profile.benchByRace ? turnsLeftInRace(state, player) : Infinity
    return best(
      short,
      (action) => {
        const car = carOf(state, player, action.carId)
        const needed = fuelNeeded(car)
        return [needed <= turnsLeft ? 1 : 0, readyAdvance(car) / needed, -car.wear]
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
  profile: Profile,
): number {
  const mod = getMod(play.action.modId)
  const estimate = estimateCard(state, player, mod, play.action, profile.coinFlips)
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
  profile: Profile,
): number {
  const opponent = otherPlayer(player)
  const target = stagedCar(state, opponent)
  if (!target) return 0
  const mod = getMod(play.action.modId)
  const estimate = estimateCard(state, player, mod, undefined, profile.coinFlips)
  // Pro keeps a first-advance stall until the opponent's car is fueled and about to move.
  if (profile.holdStalls && estimate.skip && fuelNeeded(target) > 0) return Number.NEGATIVE_INFINITY
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
  profile: Profile,
): Action {
  if (state.turn.extraFuel > 0) return chooseFuel(state, player, actions, rng, profile)

  // Priority 4: attach Parts to the car with the most races likely left in it.
  const parts = actions
    .filter((a) => a.type === 'playPart')
    .map((action) => ({ action, car: carOf(state, player, action.carId) }))
    .map((play) => ({ ...play, value: partValue(play.car, play.action.modId) }))
    .filter((play) => play.value > 0)
  if (parts.length > 0) {
    return best(parts, (play) => [-play.car.wear, play.value, readyAdvance(play.car)], rng).action
  }

  const baseline = forecastOwnAdvance(state, player, undefined, profile.coinFlips)
  const boosts: BoostPlay[] = actions
    .filter((a) => a.type === 'playBoost')
    .map((action) => ({
      action,
      forecast: forecastOwnAdvance(
        state,
        player,
        { mod: getMod(action.modId), action },
        profile.coinFlips,
      ),
    }))

  // Priority 1: a Boost that wins this advance.
  if (profile.winRule && !baseline.wins) {
    const winning = boosts.filter((play) => play.forecast.wins)
    if (winning.length > 0) {
      return best(
        winning,
        (play) => {
          const mod = getMod(play.action.modId)
          const estimate = estimateCard(state, player, mod, play.action, profile.coinFlips)
          return [-(mod.family === 'boost' ? (mod.fuelCost ?? 0) : 0), -estimate.ownWear]
        },
        rng,
      ).action
    }
  }

  // Priority 2: a Sabotage that stops the opponent winning on their next advance.
  const opponentBaseline = forecastOpponentAdvance(state, player, undefined, profile.coinFlips)
  const sabotages: SabotagePlay[] = actions
    .filter((a) => a.type === 'playSabotage')
    .map((action) => ({
      action,
      forecast: forecastOpponentAdvance(state, player, getMod(action.modId), profile.coinFlips),
    }))
  if (profile.stopRule && opponentBaseline.wins) {
    const stoppers = sabotages.filter((play) => !play.forecast.wins)
    if (stoppers.length > 0) return best(stoppers, (play) => [-play.forecast.ft], rng).action
  }

  // Fallbacks: spend a Boost or Sabotage worth at least the threshold. Pro counts distance
  // only through the turns it saves on its own finish or adds to the opponent's.
  const threshold = VALUE.playThreshold * profile.thresholdMultiplier
  const ownStart = state.race.distanceFt[player]
  const ownRemaining = TUNABLES.trackLengthFt - ownStart
  const valuedBoosts = boosts
    .map((play) => {
      let value = boostValue(state, player, play, baseline, profile)
      if (profile.turnCount) {
        const saved =
          turnsToFinish(ownRemaining, baseline.ft, baseline.ft) -
          turnsToFinish(ownRemaining, play.forecast.ft, baseline.ft)
        if (Number.isFinite(saved)) {
          value -= usefulFt(play.forecast, ownStart) - usefulFt(baseline, ownStart)
          value += saved * VALUE.turn
        }
      }
      return { play, value }
    })
    .filter(({ value }) => value >= threshold)
  if (valuedBoosts.length > 0) return best(valuedBoosts, ({ value }) => [value], rng).play.action

  const opponent = otherPlayer(player)
  const oppStart = state.race.distanceFt[opponent]
  const oppRemaining = TUNABLES.trackLengthFt - oppStart
  const valuedSabotage = sabotages
    .map((play) => {
      let value = sabotageValue(state, player, play, opponentBaseline, profile)
      if (profile.turnCount && Number.isFinite(value)) {
        const added =
          turnsToFinish(oppRemaining, play.forecast.ft, opponentBaseline.ft) -
          turnsToFinish(oppRemaining, opponentBaseline.ft, opponentBaseline.ft)
        if (Number.isFinite(added)) {
          value -= usefulFt(opponentBaseline, oppStart) - usefulFt(play.forecast, oppStart)
          value += added * VALUE.turn
        }
      }
      return { play, value }
    })
    .filter(({ value }) => value >= threshold)
  if (valuedSabotage.length > 0) {
    return best(valuedSabotage, ({ value }) => [value], rng).play.action
  }

  const end = actions.find((a) => a.type === 'endMods')
  if (!end) throw new Error('Cannot end the mod step')
  return end
}
