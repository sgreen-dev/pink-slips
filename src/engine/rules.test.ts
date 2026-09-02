import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { computeAdvance } from './advance.ts'
import { STARTERS } from '../data/starters.ts'
import {
  apply,
  createMatch,
  currentPlayer,
  fuelCost,
  isLegal,
  isOver,
  legalActions,
  otherPlayer,
  stagedCar,
} from './match.ts'
import { playTurn, stage, stageBoth, starterConfig } from './test-helpers.ts'
import { TUNABLES } from './tunables.ts'
import type { MatchState, PlayerIndex } from './types.ts'

/** Street Kings versus Exotic Garage. Both stage a Daily car so advances start on turn 2. */
function dailyRace(seed = 1): MatchState {
  let state = createMatch(starterConfig(0, 1), seed)
  const dailyFor: Record<PlayerIndex, string> = { 0: 'honda-civic-si', 1: 'mazda-mx-5-miata' }
  state = stage(state, state.firstPlayer, dailyFor[state.firstPlayer])
  const second = otherPlayer(state.firstPlayer)
  return stage(state, second, dailyFor[second])
}

/** Plays whole turns, fueling the staged car, until `predicate` holds or the cap is reached. */
function playUntil(
  state: MatchState,
  predicate: (s: MatchState) => boolean,
  cap = 200,
): MatchState {
  let current = state
  for (let i = 0; i < cap && !predicate(current); i++) {
    if (current.phase.kind === 'staging') current = stageBoth(current)
    else if (current.phase.kind === 'turn') current = playTurn(current)
    else break
  }
  return current
}

describe('3.1 setup', () => {
  it('rule 1: requires a garage of exactly 5 and a deck of exactly 30 with at most 3 copies', () => {
    const good = starterConfig()
    expect(() => createMatch(good, 1)).not.toThrow()

    const shortGarage = {
      ...good,
      players: [
        { ...good.players[0], garage: good.players[0].garage.slice(0, 4) },
        good.players[1],
      ] as const,
    }
    expect(() => createMatch(shortGarage, 1)).toThrow(/garage/)

    const shortDeck = {
      ...good,
      players: [
        good.players[0],
        { ...good.players[1], deck: good.players[1].deck.slice(0, 29) },
      ] as const,
    }
    expect(() => createMatch(shortDeck, 1)).toThrow(/deck/)

    const fourCopies = {
      ...good,
      players: [
        {
          ...good.players[0],
          deck: [...Array(4).fill('turbo-kit'), ...Array(26).fill('power-shift')],
        },
        good.players[1],
      ] as const,
    }
    expect(() => createMatch(fourCopies, 1)).toThrow(/copies/)

    const unknownCar = {
      ...good,
      players: [
        { ...good.players[0], garage: [...good.players[0].garage.slice(0, 4), 'not-a-car'] },
        good.players[1],
      ] as const,
    }
    expect(() => createMatch(unknownCar, 1)).toThrow(/not-a-car/)
  })

  it('rule 2: every garage car exposes fuel, parts, and wear for the whole match', () => {
    const state = createMatch(starterConfig(), 1)
    for (const player of state.players) {
      expect(player.garage).toHaveLength(TUNABLES.garageSize)
      for (const car of player.garage) {
        expect(car).toEqual({
          carId: car.carId,
          fuel: 0,
          wear: 0,
          parts: [],
          tractionShield: false,
        })
      }
    }
  })

  it('rule 3: each player shuffles their deck and draws 5', () => {
    const config = starterConfig()
    const state = createMatch(config, 1)
    for (const [index, player] of state.players.entries()) {
      const configured = config.players[index === 0 ? 0 : 1].deck
      expect(player.hand).toHaveLength(TUNABLES.startingHandSize)
      expect(player.deck).toHaveLength(TUNABLES.modDeckSize - TUNABLES.startingHandSize)
      expect([...player.hand, ...player.deck].sort()).toEqual([...configured].sort())
      expect([...player.hand, ...player.deck]).not.toEqual([...configured])
      expect(player.discard).toEqual([])
    }
  })

  it('rule 4: a coin flip decides who goes first', () => {
    const firsts = new Set<PlayerIndex>()
    for (let seed = 1; seed <= 20; seed++) {
      const state = createMatch(starterConfig(), seed)
      firsts.add(state.firstPlayer)
      const flip = state.log.find((entry) => entry.kind === 'coinFlip')
      expect(flip).toBeDefined()
      if (flip?.kind === 'coinFlip' && flip.purpose === 'firstPlayer') {
        expect(flip.firstPlayer).toBe(state.firstPlayer)
      }
    }
    expect(firsts).toEqual(new Set<PlayerIndex>([0, 1]))
  })

  it('rule 5: each player stages one car from their garage and both start at 0 ft', () => {
    let state = createMatch(starterConfig(), 1)
    expect(state.phase).toEqual({
      kind: 'staging',
      pending: [state.firstPlayer, otherPlayer(state.firstPlayer)],
    })
    expect(currentPlayer(state)).toBe(state.firstPlayer)

    const first = state.firstPlayer
    const second = otherPlayer(first)
    expect(legalActions(state, second)).toEqual([])
    expect(legalActions(state, first).map((a) => a.type)).toEqual(Array(5).fill('stage'))

    state = stageBoth(state)
    expect(stagedCar(state, 0)?.carId).toBe(STARTERS[0]?.cars[0])
    expect(stagedCar(state, 1)?.carId).toBe(STARTERS[1]?.cars[0])
    expect(state.phase).toEqual({ kind: 'turn' })
    expect(state.race.distanceFt).toEqual([0, 0])
    expect(state.turn).toMatchObject({ player: first, number: 1, step: 'fuel' })
  })
})

describe('3.2 turn', () => {
  it('step 1: draws one card at the start of every turn', () => {
    const state = dailyRace()
    const player = state.turn.player
    expect(state.players[player].hand).toHaveLength(TUNABLES.startingHandSize + 1)
    expect(state.players[otherPlayer(player)].hand).toHaveLength(TUNABLES.startingHandSize)
    const next = playTurn(state)
    expect(next.players[otherPlayer(player)].hand).toHaveLength(TUNABLES.startingHandSize + 1)
  })

  it('step 1: shuffles the discard pile into the deck when the deck is empty', () => {
    let state = dailyRace()
    const player = state.turn.player
    const other = otherPlayer(player)
    const discard = ['turbo-kit', 'power-shift', 'wheelspin']
    state = {
      ...state,
      players:
        player === 0
          ? [state.players[0], { ...state.players[1], deck: [], discard }]
          : [{ ...state.players[0], deck: [], discard }, state.players[1]],
    }
    const before = state.players[other].hand.length
    const next = playTurn(state)
    expect(next.players[other].hand).toHaveLength(before + 1)
    expect(next.players[other].deck).toHaveLength(discard.length - 1)
    expect(next.players[other].discard).toEqual([])
    expect([...next.players[other].deck, next.players[other].hand.at(-1)].sort()).toEqual(
      [...discard].sort(),
    )
    expect(next.log.some((entry) => entry.kind === 'reshuffle' && entry.player === other)).toBe(
      true,
    )
  })

  it('step 1: running out of cards with nothing to reshuffle costs nothing', () => {
    let state = dailyRace()
    const player = state.turn.player
    const other = otherPlayer(player)
    state = {
      ...state,
      players:
        player === 0
          ? [state.players[0], { ...state.players[1], deck: [], discard: [] }]
          : [{ ...state.players[0], deck: [], discard: [] }, state.players[1]],
    }
    const before = state.players[other].hand.length
    const next = playTurn(state)
    expect(isOver(next)).toBeNull()
    expect(next.players[other].hand).toHaveLength(before)
    expect(next.turn.player).toBe(other)
  })

  it('step 2: places one fuel on any garage car, staged or not, and it is mandatory', () => {
    const state = dailyRace()
    const player = state.turn.player
    const actions = legalActions(state, player)
    expect(actions.map((a) => a.type)).toEqual(Array(5).fill('fuel'))
    expect(legalActions(state, otherPlayer(player))).toEqual([])
    expect(isLegal(state, { type: 'endMods', player })).toBe(false)

    const benchCar = state.players[player].garage.find(
      (car) => car.carId !== state.players[player].stagedCarId,
    )
    if (!benchCar) throw new Error('no bench car')
    const next = apply(state, { type: 'fuel', player, carId: benchCar.carId })
    const fueled = next.players[player].garage.find((car) => car.carId === benchCar.carId)
    expect(fueled?.fuel).toBe(1)
    expect(next.turn.step).toBe('mods')
  })

  it('step 3: the mod step is present and, with no mod plays yet, ends with one action', () => {
    let state = dailyRace()
    const player = state.turn.player
    state = apply(state, { type: 'fuel', player, carId: state.players[player].stagedCarId ?? '' })
    expect(state.turn.step).toBe('mods')
    const actions = legalActions(state, player)
    expect(actions).toContainEqual({ type: 'endMods', player })
    for (const action of actions) {
      expect(['endMods', 'playPart', 'playBoost', 'playSabotage']).toContain(action.type)
    }
  })

  it('step 4: the staged car advances only when its fuel is at or above its cost', () => {
    let state = dailyRace()
    state = playTurn(state) // first player's turn 1: fueled to 1, advance skipped
    const player = state.turn.player
    const staged = stagedCar(state, player)
    if (!staged) throw new Error('no staged car')
    expect(fuelCost(staged)).toBe(1)

    // Fuel a bench car instead so the staged car stays at 0 and cannot advance.
    const bench = state.players[player].garage.find((car) => car.carId !== staged.carId)
    let next = apply(state, { type: 'fuel', player, carId: bench?.carId ?? '' })
    next = apply(next, { type: 'endMods', player })
    expect(next.turn.player).toBe(otherPlayer(player))
    expect(next.log.filter((e) => e.kind === 'advanceSkipped').at(-1)).toEqual({
      kind: 'advanceSkipped',
      player,
      reason: 'notFueled',
    })
    expect(next.race.distanceFt).toEqual([0, 0])

    // Fuel the staged car and it advances.
    let fueled = apply(state, { type: 'fuel', player, carId: staged.carId })
    fueled = apply(fueled, { type: 'endMods', player })
    expect(fueled.turn.step).toBe('advance')
    expect(legalActions(fueled, player)).toEqual([{ type: 'advance', player }])
    fueled = apply(fueled, { type: 'advance', player })
    expect(fueled.race.distanceFt[player]).toBeGreaterThan(0)
  })

  it('the first player skips the advance step on their first turn only', () => {
    let state = dailyRace()
    const first = state.turn.player
    expect(state.turn.number).toBe(1)
    state = playTurn(state) // fuel to 1 meets a Daily cost of 1, yet no advance
    expect(state.log.some((e) => e.kind === 'advanceSkipped' && e.reason === 'firstTurn')).toBe(
      true,
    )
    expect(state.race.distanceFt).toEqual([0, 0])
    expect(state.turn).toMatchObject({ player: otherPlayer(first), number: 2, step: 'fuel' })

    state = playTurn(state) // second player advances on turn 2
    expect(state.race.distanceFt[otherPlayer(first)]).toBeGreaterThan(0)
    state = playTurn(state) // first player advances on turn 3
    expect(state.race.distanceFt[first]).toBeGreaterThan(0)
  })

  it('players alternate and the turn number counts up', () => {
    let state = dailyRace()
    const first = state.turn.player
    for (let n = 1; n <= 4; n++) {
      expect(state.turn.number).toBe(n)
      expect(state.turn.player).toBe(n % 2 === 1 ? first : otherPlayer(first))
      state = playTurn(state)
    }
  })
})

describe('3.3 advance in a match', () => {
  it('moves the staged car by the formula result and logs the breakdown', () => {
    let state = dailyRace()
    state = playTurn(state)
    const player = state.turn.player
    const car = getCar(stagedCar(state, player)?.carId ?? '')
    state = playTurn(state)
    const expected = computeAdvance({
      car,
      wear: 0,
      startFt: 0,
      isFirstAdvanceOfRace: true,
    }).finalFt
    expect(state.race.distanceFt[player]).toBe(expected)
    const entry = state.log.findLast((e) => e.kind === 'advance')
    expect(entry?.kind === 'advance' && entry.breakdown.finalFt).toBe(expected)
  })

  it('step 7: ends the race the moment a car reaches or passes the track length', () => {
    const state = playUntil(dailyRace(), (s) => s.log.some((e) => e.kind === 'raceEnd'))
    const raceEnd = state.log.find((e) => e.kind === 'raceEnd')
    expect(raceEnd).toBeDefined()
    const lastAdvance = state.log.findLast((e) => e.kind === 'advance')
    expect(lastAdvance?.kind === 'advance' && lastAdvance.toFt).toBeGreaterThanOrEqual(
      TUNABLES.trackLengthFt,
    )
    expect(state.race.number).toBe(2)
  })
})

describe('3.4 race end', () => {
  function firstRaceEnd(): {
    before: MatchState
    after: MatchState
    winner: PlayerIndex
    loser: PlayerIndex
  } {
    let before = dailyRace()
    before = playUntil(before, (s) => {
      if (s.phase.kind !== 'turn' || s.turn.step !== 'fuel') return false
      const car = stagedCar(s, s.turn.player)
      const start = s.race.distanceFt[s.turn.player]
      if (!car) return false
      const next = computeAdvance({
        car: getCar(car.carId),
        wear: car.wear,
        startFt: start,
        isFirstAdvanceOfRace: s.race.advances[s.turn.player] === 0,
      }).finalFt
      return car.fuel >= fuelCost(car) && start + next >= TUNABLES.trackLengthFt
    })
    const winner = before.turn.player
    const after = playTurn(before)
    return { before, after, winner, loser: otherPlayer(winner) }
  }

  it('rule 1: the winner takes the losing car as a pink slip and its fuel and parts are gone', () => {
    const { before, after, winner, loser } = firstRaceEnd()
    const captured = before.players[loser].stagedCarId
    expect(captured).not.toBeNull()
    expect(after.players[winner].pinkSlips).toEqual([captured])
    expect(after.players[loser].garage.map((c) => c.carId)).not.toContain(captured)
    expect(after.players[loser].garage).toHaveLength(TUNABLES.garageSize - 1)
    expect(after.players[loser].stagedCarId).toBeNull()
  })

  it('rule 2: the winning car gains 1 wear', () => {
    const { before, after, winner } = firstRaceEnd()
    const carId = before.players[winner].stagedCarId
    const car = after.players[winner].garage.find((c) => c.carId === carId)
    expect(car?.wear).toBe(1)
  })

  it('rule 3: the loser must stage, the winner may keep or swap for free, and fuel, wear, and parts stay put', () => {
    const { after, winner, loser } = firstRaceEnd()
    expect(after.phase).toEqual({ kind: 'staging', pending: [loser, winner] })
    expect(legalActions(after, winner)).toEqual([])
    expect(legalActions(after, loser).map((a) => a.type)).toEqual(Array(4).fill('stage'))

    const loserPick = after.players[loser].garage[1]?.carId ?? ''
    let next = stage(after, loser, loserPick)
    expect(next.phase).toEqual({ kind: 'staging', pending: [winner] })
    const winnerOptions = legalActions(next, winner)
    expect(winnerOptions).toHaveLength(TUNABLES.garageSize)
    const keep = after.players[winner].stagedCarId ?? ''
    expect(winnerOptions).toContainEqual({ type: 'stage', player: winner, carId: keep })

    const swapTo = after.players[winner].garage.find((c) => c.carId !== keep)?.carId ?? ''
    const swapped = stage(next, winner, swapTo)
    expect(swapped.players[winner].stagedCarId).toBe(swapTo)
    const oldCar = swapped.players[winner].garage.find((c) => c.carId === keep)
    expect(oldCar?.wear).toBe(1)
    expect(oldCar?.fuel).toBe(after.players[winner].garage.find((c) => c.carId === keep)?.fuel)

    next = stage(next, winner, keep)
    expect(next.players[winner].stagedCarId).toBe(keep)
  })

  it('rule 4: both cars reset to 0 ft for the next race', () => {
    const { after } = firstRaceEnd()
    expect(after.race.distanceFt).toEqual([0, 0])
    expect(after.race.advances).toEqual([0, 0])
    expect(after.race.number).toBe(2)
  })

  it('rule 5: play continues with the next turn in normal alternation', () => {
    const { before, after, winner, loser } = firstRaceEnd()
    expect(after.turn.number).toBe(before.turn.number + 1)
    expect(after.turn.player).toBe(loser)
    const next = stageBoth(after)
    expect(next.turn).toMatchObject({ player: loser, number: before.turn.number + 1, step: 'fuel' })
    expect(next.players[loser].hand).toHaveLength(after.players[loser].hand.length + 1)
    expect(currentPlayer(next)).toBe(loser)
    expect(legalActions(next, winner)).toEqual([])
  })
})

describe('3.5 match end', () => {
  it('a player holding 3 pink slips wins immediately and the garage never empties', () => {
    const state = playUntil(dailyRace(), (s) => isOver(s) !== null, 2000)
    const winner = isOver(state)
    expect(winner).not.toBeNull()
    if (winner === null) return
    expect(state.phase).toEqual({ kind: 'over', winner })
    expect(state.players[winner].pinkSlips).toHaveLength(TUNABLES.pinkSlipsToWin)
    expect(state.players[otherPlayer(winner)].garage.length).toBeGreaterThanOrEqual(
      TUNABLES.garageSize - TUNABLES.pinkSlipsToWin,
    )
    expect(state.log.at(-1)).toEqual({ kind: 'matchEnd', winner })
    expect(legalActions(state, 0)).toEqual([])
    expect(legalActions(state, 1)).toEqual([])
    expect(currentPlayer(state)).toBeNull()
  })
})

describe('3.6 coin flips', () => {
  it('the first-player flip comes from the seeded generator, so a seed fixes it', () => {
    const a = createMatch(starterConfig(), 9)
    const b = createMatch(starterConfig(), 9)
    expect(a.firstPlayer).toBe(b.firstPlayer)
    expect(a.rng).toBe(b.rng)
  })
})

describe('legality', () => {
  it('apply rejects any action that legalActions does not list', () => {
    const state = createMatch(starterConfig(), 1)
    const first = state.firstPlayer
    expect(() => apply(state, { type: 'fuel', player: first, carId: 'honda-civic-si' })).toThrow(
      /Illegal/,
    )
    expect(() =>
      apply(state, { type: 'stage', player: otherPlayer(first), carId: 'honda-civic-si' }),
    ).toThrow(/Illegal/)
    expect(() => apply(state, { type: 'stage', player: first, carId: 'rimac-nevera' })).toThrow(
      /Illegal/,
    )
    expect(() => apply(state, { type: 'advance', player: first })).toThrow(/Illegal/)
  })
})
