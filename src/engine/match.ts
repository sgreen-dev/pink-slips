import { getCar } from '../data/cars.ts'
import { getMod, MOD_BY_ID } from '../data/mods.ts'
import type { Mod, ModEffect } from '../data/types.ts'
import { computeAdvance, windowApplies } from './advance.ts'
import {
  fuelCost,
  gainsWearFromWinning,
  isTractionImmune,
  openSlots,
  partModifiers,
} from './mods.ts'
import { flipCoin, seedRng, shuffle, type RngState } from './rng.ts'
import { TUNABLES } from './tunables.ts'
import {
  NO_ADVANCE_MODIFIERS,
  NO_PENDING_SABOTAGE,
  type Action,
  type AdvanceModifiers,
  type CarState,
  type LogEntry,
  type MatchConfig,
  type MatchState,
  type PendingSabotage,
  type PlayerConfig,
  type PlayerIndex,
  type PlayerState,
  type TurnState,
} from './types.ts'

export { fuelCost } from './mods.ts'

/**
 * The match state machine (DESIGN.md sections 3 and 9). Four functions form the public API:
 * createMatch, legalActions, apply, and isOver. Every function is pure: apply returns a new
 * state and never touches its input, and all randomness flows through the seeded generator
 * stored in the state.
 */

export function otherPlayer(player: PlayerIndex): PlayerIndex {
  return player === 0 ? 1 : 0
}

/** The player whose decision the match is waiting on, or null when the match is over. */
export function currentPlayer(state: MatchState): PlayerIndex | null {
  switch (state.phase.kind) {
    case 'over':
      return null
    case 'staging':
      return state.phase.pending[0] ?? null
    case 'choice':
      return state.phase.player
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

/** Whether pending Traction sabotage would be ignored by this car right now. */
function tractionProtection(car: CarState): 'immune' | 'shield' | null {
  if (isTractionImmune(car)) return 'immune'
  if (car.tractionShield) return 'shield'
  return null
}

function hasPendingSabotage(pending: PendingSabotage): boolean {
  return pending.flatReductionFt > 0 || pending.halve || pending.skipAdvance
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
      garage: config.garage.map((carId) => ({
        carId,
        fuel: 0,
        wear: 0,
        parts: [],
        tractionShield: false,
      })),
      stagedCarId: null,
      hand,
      deck,
      discard: [],
      pinkSlips: [],
      pendingSabotage: NO_PENDING_SABOTAGE,
      boostBlockedNextTurn: false,
    },
    next,
  ]
}

function newTurn(player: PlayerIndex, number: number, boostBlocked: boolean): TurnState {
  return {
    player,
    number,
    step: 'fuel',
    boostsPlayed: 0,
    sabotagePlayed: 0,
    boostBlocked,
    extraFuel: 0,
    advance: NO_ADVANCE_MODIFIERS,
  }
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
    turn: newTurn(firstPlayer, 1, false),
    race: { number: 1, distanceFt: [0, 0], advances: [0, 0], coinFlips: [0, 0] },
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

function updateCar(
  state: MatchState,
  player: PlayerIndex,
  carId: string,
  update: (car: CarState) => CarState,
): MatchState {
  return setPlayer(state, player, (p) => ({
    ...p,
    garage: p.garage.map((car) => (car.carId === carId ? update(car) : car)),
  }))
}

function updateStagedCar(
  state: MatchState,
  player: PlayerIndex,
  update: (car: CarState) => CarState,
): MatchState {
  return updateCar(state, player, requireStagedCar(state, player).carId, update)
}

function setPending(
  state: MatchState,
  player: PlayerIndex,
  update: (pending: PendingSabotage) => PendingSabotage,
): MatchState {
  return setPlayer(state, player, (p) => ({ ...p, pendingSabotage: update(p.pendingSabotage) }))
}

function setTurn(state: MatchState, patch: Partial<TurnState>): MatchState {
  return { ...state, turn: { ...state.turn, ...patch } }
}

function patchAdvanceModifiers(
  state: MatchState,
  update: (mods: AdvanceModifiers) => AdvanceModifiers,
): MatchState {
  return setTurn(state, { advance: update(state.turn.advance) })
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

function removeOne(items: readonly string[], item: string): string[] {
  const index = items.indexOf(item)
  if (index === -1) throw new Error(`${item} is not present`)
  return [...items.slice(0, index), ...items.slice(index + 1)]
}

// Legal actions

function fuelActions(state: MatchState, player: PlayerIndex): Action[] {
  return state.players[player].garage.map((car) => ({ type: 'fuel', player, carId: car.carId }))
}

function boostActions(state: MatchState, player: PlayerIndex, mod: Mod): Action[] {
  const garage = state.players[player].garage
  for (const effect of mod.effects) {
    if (effect.kind === 'moveAllFuel') {
      const actions: Action[] = []
      for (const from of garage) {
        if (from.fuel === 0) continue
        for (const to of garage) {
          if (to.carId === from.carId) continue
          actions.push({
            type: 'playBoost',
            player,
            modId: mod.id,
            fromCarId: from.carId,
            toCarId: to.carId,
          })
        }
      }
      return actions
    }
    if (effect.kind === 'searchDeck') {
      const targets = new Set(
        state.players[player].deck.filter((id) => getMod(id).family === effect.family),
      )
      if (targets.size === 0) return [{ type: 'playBoost', player, modId: mod.id }]
      return [...targets].map((targetModId) => ({
        type: 'playBoost',
        player,
        modId: mod.id,
        targetModId,
      }))
    }
  }
  return [{ type: 'playBoost', player, modId: mod.id }]
}

/** Mod plays available in the mod step (DESIGN.md 2.5 limits and 3.2 step 3). */
function modActions(state: MatchState, player: PlayerIndex): Action[] {
  const p = state.players[player]
  const turn = state.turn
  const staged = requireStagedCar(state, player)
  const stagedType = getCar(staged.carId).type
  const actions: Action[] = []
  for (const modId of new Set(p.hand)) {
    const mod = getMod(modId)
    switch (mod.family) {
      case 'part':
        for (const car of p.garage) {
          if (openSlots(car) <= 0) continue
          if (mod.typeLock && getCar(car.carId).type !== mod.typeLock) continue
          actions.push({ type: 'playPart', player, modId, carId: car.carId })
        }
        break
      case 'boost':
        if (turn.boostsPlayed >= TUNABLES.boostsPerTurn || turn.boostBlocked) break
        if (mod.typeLock && stagedType !== mod.typeLock) break
        if ((mod.fuelCost ?? 0) > staged.fuel) break
        actions.push(...boostActions(state, player, mod))
        break
      case 'sabotage':
        if (turn.sabotagePlayed >= TUNABLES.sabotagePerTurn) break
        actions.push({ type: 'playSabotage', player, modId })
        break
    }
  }
  return actions
}

export function legalActions(state: MatchState, player: PlayerIndex): Action[] {
  const { phase } = state
  switch (phase.kind) {
    case 'over':
      return []
    case 'staging':
      if (phase.pending[0] !== player) return []
      return state.players[player].garage.map((car) => ({
        type: 'stage',
        player,
        carId: car.carId,
      }))
    case 'choice': {
      if (phase.player !== player) return []
      const car = state.players[player].garage.find((c) => c.carId === phase.choice.carId)
      return [...new Set(car?.parts ?? [])].map((modId) => ({ type: 'discardPart', player, modId }))
    }
    case 'turn':
      break
  }
  if (state.turn.player !== player) return []
  switch (state.turn.step) {
    case 'fuel':
      return fuelActions(state, player)
    case 'mods': {
      const owed = state.turn.extraFuel > 0
      return [
        ...(owed ? fuelActions(state, player) : []),
        ...modActions(state, player),
        ...(owed ? [] : [{ type: 'endMods', player } as const]),
      ]
    }
    case 'advance':
      return [{ type: 'advance', player }]
  }
}

function canonical(action: Action): string {
  const entries = Object.entries(action).filter(([, value]) => value !== undefined)
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(Object.fromEntries(entries))
}

export function isLegal(state: MatchState, action: Action): boolean {
  const wanted = canonical(action)
  return legalActions(state, action.player).some((legal) => canonical(legal) === wanted)
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
    case 'playPart':
      return applyPlayPart(state, action.player, action.modId, action.carId)
    case 'playBoost':
      return applyPlayBoost(state, action)
    case 'playSabotage':
      return applyPlaySabotage(state, action.player, action.modId)
    case 'discardPart':
      return applyDiscardPart(state, action.player, action.modId)
    case 'endMods':
      return applyEndMods(state)
    case 'advance':
      return applyAdvance(state)
  }
}

export function isOver(state: MatchState): PlayerIndex | null {
  return state.phase.kind === 'over' ? state.phase.winner : null
}

/**
 * Ends the match with the other player as winner (DESIGN.md 3.5). Not a legal action: the
 * screens and the room call it, so the CPU and random play-outs never do. An over match is
 * returned unchanged.
 */
export function concede(state: MatchState, player: PlayerIndex): MatchState {
  if (state.phase.kind === 'over') return state
  const winner = otherPlayer(player)
  const next: MatchState = { ...state, phase: { kind: 'over', winner } }
  return withLog(next, { kind: 'concede', player })
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

function drawForPlayer(state: MatchState, player: PlayerIndex, count: number): MatchState {
  const draw = drawCards(state.players[player], count, state.rng)
  let next = setPlayer(state, player, () => draw.player)
  next = { ...next, rng: draw.rng }
  if (draw.reshuffled > 0) {
    next = withLog(next, { kind: 'reshuffle', player, count: draw.reshuffled })
  }
  return withLog(next, { kind: 'draw', player, count: draw.drawn })
}

/** Starts a turn: the draw step runs automatically, then the player is at the fuel step. */
function beginTurn(state: MatchState, player: PlayerIndex, number: number): MatchState {
  const boostBlocked = state.players[player].boostBlockedNextTurn
  let next = setPlayer(state, player, (p) => ({ ...p, boostBlockedNextTurn: false }))
  next = { ...next, phase: { kind: 'turn' }, turn: newTurn(player, number, boostBlocked) }
  next = withLog(next, { kind: 'turnStart', player, number })
  return drawForPlayer(next, player, TUNABLES.drawPerTurn)
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
  let next = updateCar(state, player, carId, (car) => ({ ...car, fuel: car.fuel + 1 }))
  next = withLog(next, { kind: 'fuel', player, carId })
  if (next.turn.step === 'fuel') return setTurn(next, { step: 'mods' })
  return setTurn(next, { extraFuel: next.turn.extraFuel - 1 })
}

// Mods (DESIGN.md 2.5)

function applyPlayPart(
  state: MatchState,
  player: PlayerIndex,
  modId: string,
  carId: string,
): MatchState {
  let next = setPlayer(state, player, (p) => ({ ...p, hand: removeOne(p.hand, modId) }))
  next = updateCar(next, player, carId, (car) => ({ ...car, parts: [...car.parts, modId] }))
  return withLog(next, { kind: 'playPart', player, modId, carId })
}

function discardFromHand(state: MatchState, player: PlayerIndex, modId: string): MatchState {
  return setPlayer(state, player, (p) => ({
    ...p,
    hand: removeOne(p.hand, modId),
    discard: [...p.discard, modId],
  }))
}

function applyPlayBoost(state: MatchState, action: Action & { type: 'playBoost' }): MatchState {
  const { player, modId } = action
  const mod = getMod(modId)
  if (mod.family !== 'boost') throw new Error(`${modId} is not a Boost`)
  let next = discardFromHand(state, player, modId)
  if (mod.fuelCost) {
    const cost = mod.fuelCost
    next = updateStagedCar(next, player, (car) => ({ ...car, fuel: car.fuel - cost }))
  }
  next = setTurn(next, { boostsPlayed: next.turn.boostsPlayed + 1 })
  next = withLog(next, { kind: 'playBoost', player, modId })
  return applyEffects(next, player, mod.effects, { modId, action })
}

function applyPlaySabotage(state: MatchState, player: PlayerIndex, modId: string): MatchState {
  const mod = getMod(modId)
  if (mod.family !== 'sabotage') throw new Error(`${modId} is not a Sabotage`)
  let next = discardFromHand(state, player, modId)
  next = setTurn(next, { sabotagePlayed: next.turn.sabotagePlayed + 1 })
  next = withLog(next, { kind: 'playSabotage', player, modId })
  return applyEffects(next, player, mod.effects, {
    modId,
    action: { type: 'playSabotage', player, modId },
  })
}

interface EffectContext {
  modId: string
  action: Action
}

function applyEffects(
  state: MatchState,
  player: PlayerIndex,
  effects: readonly ModEffect[],
  context: EffectContext,
): MatchState {
  let next = state
  for (const effect of effects) next = applyEffect(next, player, effect, context)
  return next
}

/**
 * A coin flip made by a player's staged car (DESIGN.md 3.6). The Sports identity forces the
 * first flip a car makes each race to heads without touching the generator.
 */
function flipForPlayer(
  state: MatchState,
  player: PlayerIndex,
  modId: string,
): [boolean, MatchState] {
  const staged = requireStagedCar(state, player)
  const forcedBySports =
    getCar(staged.carId).type === 'sports' && state.race.coinFlips[player] === 0
  let heads = true
  let rng = state.rng
  if (!forcedBySports) [heads, rng] = flipCoin(rng)
  let next: MatchState = {
    ...state,
    rng,
    race: {
      ...state.race,
      coinFlips: setPair(state.race.coinFlips, player, state.race.coinFlips[player] + 1),
    },
  }
  next = withLog(next, { kind: 'coinFlip', purpose: 'mod', player, modId, heads, forcedBySports })
  return [heads, next]
}

function discardPart(
  state: MatchState,
  owner: PlayerIndex,
  carId: string,
  modId: string,
): MatchState {
  let next = updateCar(state, owner, carId, (car) => ({
    ...car,
    parts: removeOne(car.parts, modId),
  }))
  next = setPlayer(next, owner, (p) => ({ ...p, discard: [...p.discard, modId] }))
  return withLog(next, { kind: 'discardPart', player: owner, carId, modId })
}

/** Interprets one effect descriptor. `player` is the one who played the card. */
function applyEffect(
  state: MatchState,
  player: PlayerIndex,
  effect: ModEffect,
  context: EffectContext,
): MatchState {
  const opponent = otherPlayer(player)
  switch (effect.kind) {
    // This turn's advance
    case 'hpPercent':
      return patchAdvanceModifiers(state, (m) => ({ ...m, hpPercent: m.hpPercent + effect.value }))
    case 'hpPercentPerPart':
      return patchAdvanceModifiers(state, (m) => ({
        ...m,
        hpPercentPerPart: m.hpPercentPerPart + effect.value,
      }))
    case 'weightReduction':
      return patchAdvanceModifiers(state, (m) => ({
        ...m,
        weightReductionLb: m.weightReductionLb + effect.lb,
      }))
    case 'flatDistance':
      return patchAdvanceModifiers(state, (m) => ({
        ...m,
        flatBonuses: [...m.flatBonuses, { ft: effect.ft, window: effect.window }],
      }))
    case 'distancePercent':
      return patchAdvanceModifiers(state, (m) => ({
        ...m,
        distancePercent: m.distancePercent + effect.value,
      }))
    case 'extraAdvance':
      return patchAdvanceModifiers(state, (m) => ({
        ...m,
        extraAdvanceMultiplier: effect.distanceMultiplier,
      }))

    // The opponent's next advance
    case 'reduceDistance':
      return setPending(state, opponent, (s) => ({
        ...s,
        flatReductionFt: s.flatReductionFt + effect.ft,
      }))
    case 'halveDistance':
      return setPending(state, opponent, (s) => ({ ...s, halve: true }))
    case 'skipAdvance':
      if (state.race.advances[opponent] !== 0) return state
      return setPending(state, opponent, (s) => ({ ...s, skipAdvance: true }))

    // Static Part effects are read from the attached card, never applied
    case 'fuelCostDelta':
    case 'noWearFromWinning':
    case 'tractionImmunity':
      return state

    // Car state
    case 'tractionShield':
      return updateStagedCar(state, player, (car) => ({ ...car, tractionShield: true }))
    case 'addWear':
      if (effect.target === 'self') {
        return patchAdvanceModifiers(state, (m) => ({
          ...m,
          wearAfterAdvance: m.wearAfterAdvance + effect.count,
        }))
      }
      return updateStagedCar(state, opponent, (car) => ({ ...car, wear: car.wear + effect.count }))
    case 'addFuel':
      return updateStagedCar(state, player, (car) => ({ ...car, fuel: car.fuel + effect.count }))
    case 'removeFuel':
      return updateStagedCar(state, opponent, (car) => ({
        ...car,
        fuel: Math.max(0, car.fuel - effect.count),
      }))
    case 'moveAllFuel': {
      const { action } = context
      if (action.type !== 'playBoost' || !action.fromCarId || !action.toCarId) {
        throw new Error(`${context.modId} needs a source and a destination car`)
      }
      const from = state.players[player].garage.find((car) => car.carId === action.fromCarId)
      const moved = from?.fuel ?? 0
      const next = updateCar(state, player, action.fromCarId, (car) => ({ ...car, fuel: 0 }))
      return updateCar(next, player, action.toCarId, (car) => ({ ...car, fuel: car.fuel + moved }))
    }
    case 'discardPart': {
      const target = requireStagedCar(state, opponent)
      const [only] = target.parts
      if (only === undefined) return state
      if (target.parts.length === 1) return discardPart(state, opponent, target.carId, only)
      return {
        ...state,
        phase: {
          kind: 'choice',
          player: opponent,
          choice: { kind: 'discardPart', carId: target.carId },
        },
      }
    }

    // Turn and cards
    case 'extraFuelPlacement':
      return setTurn(state, { extraFuel: state.turn.extraFuel + effect.count })
    case 'draw':
      return drawForPlayer(state, player, effect.count)
    case 'searchDeck': {
      const { action } = context
      const target = action.type === 'playBoost' ? action.targetModId : undefined
      let next = state
      if (target !== undefined) {
        next = setPlayer(next, player, (p) => ({
          ...p,
          deck: removeOne(p.deck, target),
          hand: [...p.hand, target],
        }))
      }
      const [deck, rng] = shuffle(next.rng, next.players[player].deck)
      next = setPlayer(next, player, (p) => ({ ...p, deck }))
      return { ...next, rng }
    }
    case 'blockBoost':
      return setPlayer(state, opponent, (p) => ({ ...p, boostBlockedNextTurn: true }))

    // Randomness
    case 'coinFlip': {
      const [heads, next] = flipForPlayer(state, player, context.modId)
      return applyEffects(next, player, heads ? effect.heads : effect.tails, context)
    }
  }
}

function applyDiscardPart(state: MatchState, player: PlayerIndex, modId: string): MatchState {
  if (state.phase.kind !== 'choice') throw new Error('No choice pending')
  const next = discardPart(state, player, state.phase.choice.carId, modId)
  return { ...next, phase: { kind: 'turn' } }
}

// Advance (DESIGN.md 3.2 step 4 and 3.3)

/** Why the staged car cannot advance this turn, or null when it can. */
function advanceBlocker(state: MatchState): 'firstTurn' | 'notFueled' | 'redLight' | null {
  if (state.turn.number === 1) return 'firstTurn'
  const car = requireStagedCar(state, state.turn.player)
  if (car.fuel < fuelCost(car)) return 'notFueled'
  const pending = state.players[state.turn.player].pendingSabotage
  if (pending.skipAdvance && tractionProtection(car) === null) return 'redLight'
  return null
}

function applyEndMods(state: MatchState): MatchState {
  const player = state.turn.player
  const blocker = advanceBlocker(state)
  if (blocker === null) return setTurn(state, { step: 'advance' })
  let next = state
  if (blocker === 'redLight') next = setPending(next, player, () => NO_PENDING_SABOTAGE)
  next = withLog(next, { kind: 'advanceSkipped', player, reason: blocker })
  return endTurn(next)
}

/** One advance by the staged car. Ends the race when the car reaches the finish. */
function performAdvance(
  state: MatchState,
  player: PlayerIndex,
  options: { useTurnModifiers: boolean; finalMultiplier: number },
): MatchState {
  const staged = requireStagedCar(state, player)
  const car = getCar(staged.carId)
  const parts = partModifiers(staged)
  const mods = options.useTurnModifiers ? state.turn.advance : NO_ADVANCE_MODIFIERS
  const startFt = state.race.distanceFt[player]
  const isFirst = state.race.advances[player] === 0
  const flatBonusFt = [...parts.flatBonuses, ...mods.flatBonuses]
    .filter((bonus) => windowApplies(bonus.window, startFt, isFirst))
    .reduce((sum, bonus) => sum + bonus.ft, 0)
  const pending = state.players[player].pendingSabotage
  const protection = tractionProtection(staged)
  const breakdown = computeAdvance({
    car,
    wear: staged.wear,
    startFt,
    isFirstAdvanceOfRace: isFirst,
    hpPercent: parts.hpPercent + mods.hpPercent + mods.hpPercentPerPart * staged.parts.length,
    weightReductionLb: parts.weightReductionLb + mods.weightReductionLb,
    flatBonusFt,
    distancePercent: mods.distancePercent,
    sabotage:
      protection === null
        ? { flatReductionFt: pending.flatReductionFt, halve: pending.halve }
        : undefined,
    finalMultiplier: options.finalMultiplier,
  })
  const toFt = startFt + breakdown.finalFt
  const wearGained = options.useTurnModifiers ? mods.wearAfterAdvance : 0

  let next = setPending(state, player, () => NO_PENDING_SABOTAGE)
  next = updateCar(next, player, staged.carId, (c) => ({
    ...c,
    tractionShield: false,
    wear: c.wear + wearGained,
  }))
  next = {
    ...next,
    race: {
      ...next.race,
      distanceFt: setPair(next.race.distanceFt, player, toFt),
      advances: setPair(next.race.advances, player, next.race.advances[player] + 1),
    },
  }
  if (protection !== null && hasPendingSabotage(pending)) {
    next = withLog(next, { kind: 'tractionIgnored', player, reason: protection })
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
  return next
}

function applyAdvance(state: MatchState): MatchState {
  const player = state.turn.player
  const extra = state.turn.advance.extraAdvanceMultiplier
  let next = performAdvance(state, player, { useTurnModifiers: true, finalMultiplier: 1 })
  if (next.phase.kind !== 'turn') return next
  if (extra !== null) {
    next = performAdvance(next, player, { useTurnModifiers: false, finalMultiplier: extra })
    if (next.phase.kind !== 'turn') return next
  }
  return endTurn(next)
}

/** Race end (DESIGN.md 3.4) and match end (3.5). */
function endRace(state: MatchState, winner: PlayerIndex): MatchState {
  const loser = otherPlayer(winner)
  const captured = requireStagedCar(state, loser)
  const winningCar = requireStagedCar(state, winner)
  let next = setPlayer(state, loser, (p) => ({
    ...p,
    garage: p.garage.filter((car) => car.carId !== captured.carId),
    discard: [...p.discard, ...captured.parts],
    stagedCarId: null,
    pendingSabotage: NO_PENDING_SABOTAGE,
  }))
  next = setPlayer(next, winner, (p) => ({
    ...p,
    pinkSlips: [...p.pinkSlips, captured.carId],
    pendingSabotage: NO_PENDING_SABOTAGE,
  }))
  if (gainsWearFromWinning(winningCar)) {
    next = updateCar(next, winner, winningCar.carId, (car) => ({ ...car, wear: car.wear + 1 }))
  }
  next = withLog(next, {
    kind: 'raceEnd',
    race: state.race.number,
    winner,
    capturedCarId: captured.carId,
  })
  if (next.players[winner].pinkSlips.length >= TUNABLES.pinkSlipsToWin) {
    next = { ...next, phase: { kind: 'over', winner } }
    return withLog(next, { kind: 'matchEnd', winner })
  }
  return {
    ...next,
    phase: { kind: 'staging', pending: [loser, winner] },
    race: {
      number: state.race.number + 1,
      distanceFt: [0, 0],
      advances: [0, 0],
      coinFlips: [0, 0],
    },
    turn: newTurn(otherPlayer(state.turn.player), state.turn.number + 1, false),
  }
}
