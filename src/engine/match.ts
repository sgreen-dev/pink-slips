import { getCar } from '../data/cars.ts'
import { MOD_BY_ID } from '../data/mods.ts'
import { computeAdvance } from './advance.ts'
import { flipCoin, seedRng, shuffle, type RngState } from './rng.ts'
import { TUNABLES } from './tunables.ts'
import type {
  Action,
  CarState,
  LogEntry,
  MatchConfig,
  MatchState,
  PlayerConfig,
  PlayerIndex,
  PlayerState,
} from './types.ts'

/**
 * The match state machine (DESIGN.md sections 3 and 9). Four functions form the public API:
 * createMatch, legalActions, apply, and isOver. Every function is pure: apply returns a new
 * state and never touches its input, and all randomness flows through the seeded generator
 * stored in the state.
 */

export function otherPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0
}

/** Fuel a car needs before it can advance (DESIGN.md 2.2). Parts that change it arrive in phase 3. */
export function fuelCost(car: CarState): number {
  return TUNABLES.fuelCostByTier[getCar(car.carId).tier]
}

/** The player whose decision the match is waiting on, or null when the match is over. */
export function currentPlayer(state: MatchState): PlayerIndex | null {
  switch (state.phase.kind) {
    case 'over':
      return null
    case 'staging':
      return state.phase.pending[0] ?? null
    case 'turn':
      return state.turn.player
  }
}

export function stagedCar(state: MatchState, player: PlayerIndex): CarState | null {
  const p = state.players[player]
  if (p.stagedCarId === null) return null
  return p.garage.find((car) => car.carId === p.stagedCarId) ?? null
}

function requireStagedCar(state: MatchState, player: PlayerIndex): CarState {
  const car = stagedCar(state, player)
  if (!car) throw new Error(`Player ${player + 1} has no staged car`)
  return car
}

// Setup (DESIGN.md 3.1)

function validatePlayerConfig(config: PlayerConfig, label: string): void {
  const { garageSize, modDeckSize, maxCopiesPerMod } = TUNABLES
  if (config.garage.length !== garageSize) {
    throw new Error(`${label}: garage must have exactly ${garageSize} cars`)
  }
  if (new Set(config.garage).size !== config.garage.length) {
    throw new Error(`${label}: garage cars must be unique`)
  }
  for (const id of config.garage) getCar(id)
  if (config.deck.length !== modDeckSize) {
    throw new Error(`${label}: mod deck must have exactly ${modDeckSize} cards`)
  }
  const copies = new Map<string, number>()
  for (const id of config.deck) {
    if (!MOD_BY_ID.has(id)) throw new Error(`${label}: unknown mod id ${id}`)
    const count = (copies.get(id) ?? 0) + 1
    if (count > maxCopiesPerMod) {
      throw new Error(`${label}: more than ${maxCopiesPerMod} copies of ${id}`)
    }
    copies.set(id, count)
  }
}

function setupPlayer(config: PlayerConfig, rng: RngState): [PlayerState, RngState] {
  const [shuffled, next] = shuffle(rng, config.deck)
  const hand = shuffled.slice(0, TUNABLES.startingHandSize)
  const deck = shuffled.slice(TUNABLES.startingHandSize)
  return [
    {
      garage: config.garage.map((carId) => ({ carId, fuel: 0, wear: 0, parts: [] })),
      stagedCarId: null,
      hand,
      deck,
      discard: [],
      pinkSlips: [],
    },
    next,
  ]
}

export function createMatch(config: MatchConfig, seed: number): MatchState {
  validatePlayerConfig(config.players[0], 'Player 1')
  validatePlayerConfig(config.players[1], 'Player 2')
  const [p0, rng1] = setupPlayer(config.players[0], seedRng(seed))
  const [p1, rng2] = setupPlayer(config.players[1], rng1)
  const [heads, rng] = flipCoin(rng2)
  const firstPlayer: PlayerIndex = heads ? 0 : 1
  return {
    players: [p0, p1],
    firstPlayer,
    phase: { kind: 'staging', pending: [firstPlayer, otherPlayer(firstPlayer)] },
    turn: { player: firstPlayer, number: 1, step: 'fuel' },
    race: { number: 1, distanceFt: [0, 0], advances: [0, 0] },
    rng,
    log: [
      { kind: 'draw', player: 0, count: p0.hand.length },
      { kind: 'draw', player: 1, count: p1.hand.length },
      { kind: 'coinFlip', purpose: 'firstPlayer', heads, firstPlayer },
    ],
  }
}

// State helpers. Each returns a new state.

function setPlayer(
  state: MatchState,
  player: PlayerIndex,
  update: (p: PlayerState) => PlayerState,
): MatchState {
  const players: [PlayerState, PlayerState] =
    player === 0
      ? [update(state.players[0]), state.players[1]]
      : [state.players[0], update(state.players[1])]
  return { ...state, players }
}

function withLog(state: MatchState, entry: LogEntry): MatchState {
  return { ...state, log: [...state.log, entry] }
}

function setPair(
  pair: readonly [number, number],
  player: PlayerIndex,
  value: number,
): [number, number] {
  return player === 0 ? [value, pair[1]] : [pair[0], value]
}

// Legal actions

export function legalActions(state: MatchState, player: PlayerIndex): Action[] {
  const { phase } = state
  if (phase.kind === 'over') return []
  const garage = state.players[player].garage
  if (phase.kind === 'staging') {
    if (phase.pending[0] !== player) return []
    return garage.map((car) => ({ type: 'stage', player, carId: car.carId }))
  }
  if (state.turn.player !== player) return []
  switch (state.turn.step) {
    case 'fuel':
      return garage.map((car) => ({ type: 'fuel', player, carId: car.carId }))
    case 'mods':
      return [{ type: 'endMods', player }]
    case 'advance':
      return [{ type: 'advance', player }]
  }
}

function carIdOf(action: Action): string | undefined {
  return 'carId' in action ? action.carId : undefined
}

function sameAction(a: Action, b: Action): boolean {
  return a.type === b.type && a.player === b.player && carIdOf(a) === carIdOf(b)
}

export function isLegal(state: MatchState, action: Action): boolean {
  return legalActions(state, action.player).some((legal) => sameAction(legal, action))
}

// Apply

export function apply(state: MatchState, action: Action): MatchState {
  if (!isLegal(state, action)) {
    throw new Error(`Illegal action: ${JSON.stringify(action)}`)
  }
  switch (action.type) {
    case 'stage':
      return applyStage(state, action.player, action.carId)
    case 'fuel':
      return applyFuel(state, action.player, action.carId)
    case 'endMods':
      return applyEndMods(state)
    case 'advance':
      return applyAdvance(state)
  }
}

export function isOver(state: MatchState): PlayerIndex | null {
  return state.phase.kind === 'over' ? state.phase.winner : null
}

/** Draws up to `count` cards, reshuffling the discard pile into the deck when it runs out. */
function drawCards(
  player: PlayerState,
  count: number,
  rng: RngState,
): { player: PlayerState; rng: RngState; drawn: number; reshuffled: number } {
  let deck = [...player.deck]
  let discard = [...player.discard]
  const hand = [...player.hand]
  let drawn = 0
  let reshuffled = 0
  let next = rng
  for (let i = 0; i < count; i++) {
    if (deck.length === 0 && discard.length > 0) {
      ;[deck, next] = shuffle(next, discard)
      reshuffled += deck.length
      discard = []
    }
    const card = deck.shift()
    if (card === undefined) break
    hand.push(card)
    drawn++
  }
  return { player: { ...player, hand, deck, discard }, rng: next, drawn, reshuffled }
}

/** Starts a turn: the draw step runs automatically, then the player is at the fuel step. */
function beginTurn(state: MatchState, player: PlayerIndex, number: number): MatchState {
  const draw = drawCards(state.players[player], TUNABLES.drawPerTurn, state.rng)
  let next = setPlayer(state, player, () => draw.player)
  next = { ...next, rng: draw.rng, phase: { kind: 'turn' }, turn: { player, number, step: 'fuel' } }
  if (draw.reshuffled > 0) {
    next = withLog(next, { kind: 'reshuffle', player, count: draw.reshuffled })
  }
  return withLog(next, { kind: 'draw', player, count: draw.drawn })
}

function endTurn(state: MatchState): MatchState {
  return beginTurn(state, otherPlayer(state.turn.player), state.turn.number + 1)
}

function applyStage(state: MatchState, player: PlayerIndex, carId: string): MatchState {
  if (state.phase.kind !== 'staging') throw new Error('Not staging')
  const pending = state.phase.pending.slice(1)
  let next = setPlayer(state, player, (p) => ({ ...p, stagedCarId: carId }))
  next = withLog(next, { kind: 'stage', player, carId })
  if (pending.length > 0) return { ...next, phase: { kind: 'staging', pending } }
  return beginTurn(next, next.turn.player, next.turn.number)
}

function applyFuel(state: MatchState, player: PlayerIndex, carId: string): MatchState {
  let next = setPlayer(state, player, (p) => ({
    ...p,
    garage: p.garage.map((car) => (car.carId === carId ? { ...car, fuel: car.fuel + 1 } : car)),
  }))
  next = withLog(next, { kind: 'fuel', player, carId })
  return { ...next, turn: { ...next.turn, step: 'mods' } }
}

/** Why the staged car cannot advance this turn, or null when it can (DESIGN.md 3.2). */
function advanceBlocker(state: MatchState): 'firstTurn' | 'notFueled' | null {
  if (state.turn.number === 1) return 'firstTurn'
  const car = requireStagedCar(state, state.turn.player)
  if (car.fuel < fuelCost(car)) return 'notFueled'
  return null
}

function applyEndMods(state: MatchState): MatchState {
  const blocker = advanceBlocker(state)
  if (blocker === null) return { ...state, turn: { ...state.turn, step: 'advance' } }
  const next = withLog(state, {
    kind: 'advanceSkipped',
    player: state.turn.player,
    reason: blocker,
  })
  return endTurn(next)
}

function applyAdvance(state: MatchState): MatchState {
  const player = state.turn.player
  const staged = requireStagedCar(state, player)
  const startFt = state.race.distanceFt[player]
  const breakdown = computeAdvance({
    car: getCar(staged.carId),
    wear: staged.wear,
    startFt,
    isFirstAdvanceOfRace: state.race.advances[player] === 0,
  })
  const toFt = startFt + breakdown.finalFt
  let next: MatchState = {
    ...state,
    race: {
      ...state.race,
      distanceFt: setPair(state.race.distanceFt, player, toFt),
      advances: setPair(state.race.advances, player, state.race.advances[player] + 1),
    },
  }
  next = withLog(next, {
    kind: 'advance',
    player,
    carId: staged.carId,
    fromFt: startFt,
    toFt,
    breakdown,
  })
  if (toFt >= TUNABLES.trackLengthFt) return endRace(next, player)
  return endTurn(next)
}

/** Race end (DESIGN.md 3.4) and match end (3.5). */
function endRace(state: MatchState, winner: PlayerIndex): MatchState {
  const loser = otherPlayer(winner)
  const capturedCarId = requireStagedCar(state, loser).carId
  let next = setPlayer(state, loser, (p) => ({
    ...p,
    garage: p.garage.filter((car) => car.carId !== capturedCarId),
    stagedCarId: null,
  }))
  next = setPlayer(next, winner, (p) => ({
    ...p,
    pinkSlips: [...p.pinkSlips, capturedCarId],
    garage: p.garage.map((car) =>
      car.carId === p.stagedCarId ? { ...car, wear: car.wear + 1 } : car,
    ),
  }))
  next = withLog(next, { kind: 'raceEnd', race: state.race.number, winner, capturedCarId })
  if (next.players[winner].pinkSlips.length >= TUNABLES.pinkSlipsToWin) {
    next = { ...next, phase: { kind: 'over', winner } }
    return withLog(next, { kind: 'matchEnd', winner })
  }
  return {
    ...next,
    phase: { kind: 'staging', pending: [loser, winner] },
    race: { number: state.race.number + 1, distanceFt: [0, 0], advances: [0, 0] },
    turn: { player: otherPlayer(state.turn.player), number: state.turn.number + 1, step: 'fuel' },
  }
}
