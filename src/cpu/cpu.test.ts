import { describe, expect, it } from 'vitest'
import { getMod } from '../data/mods.ts'
import { STARTERS } from '../data/starters.ts'
import {
  apply,
  currentPlayer,
  isLegal,
  isOver,
  legalActions,
  TUNABLES,
  type MatchConfig,
} from '../engine/index.ts'
import {
  scenario,
  starterConfig,
  type PlayerSpec,
  type ScenarioSpec,
} from '../engine/test-helpers.ts'
import { chooseAction } from './cpu.ts'
import { playCpuMatch } from './play.ts'
import { forecastOpponentAdvance, forecastOwnAdvance, readyAdvance } from './predict.ts'

const CIVIC = 'honda-civic-si' // JDM, Daily, cost 1, 203 ft
const MIATA = 'mazda-mx-5-miata' // Sports, Daily, cost 1, 232 ft
const MUSTANG = 'ford-mustang-gt' // Muscle, Performance, cost 2, 372 ft
const GTR = 'nissan-gt-r' // JDM, Super, cost 3, 430 ft
const WRX = 'subaru-wrx-sti' // Off-road, Performance, cost 2

function duel(
  p0: Partial<PlayerSpec> = {},
  p1: Partial<PlayerSpec> = {},
  extra: Partial<ScenarioSpec> = {},
) {
  return scenario({
    players: [
      { cars: [{ id: CIVIC, fuel: 1 }, { id: MUSTANG }], ...p0 },
      { cars: [{ id: MIATA, fuel: 1 }, { id: GTR }], ...p1 },
    ],
    ...extra,
  })
}

describe('CPU priorities (DESIGN.md section 6)', () => {
  it('1: plays a winning Boost when one exists', () => {
    // 1050 + 203 falls short; Power Shift's 100 ft crosses the line. Nitrous reads as +50.
    const state = duel(
      { cars: [{ id: CIVIC, fuel: 2 }], hand: ['nitrous-shot', 'power-shift', 'wheelspin'] },
      {},
      { distanceFt: [1050, 0] },
    )
    expect(forecastOwnAdvance(state, 0).wins).toBe(false)
    expect(chooseAction(state, 0)).toEqual({ type: 'playBoost', player: 0, modId: 'power-shift' })
  })

  it('1: pays fuel for the win when the only winning Boost costs fuel', () => {
    const state = duel(
      { cars: [{ id: CIVIC, fuel: 2 }], hand: ['power-shift', 'fuel-dump'] },
      {},
      { distanceFt: [900, 0] },
    )
    expect(chooseAction(state, 0)).toEqual({ type: 'playBoost', player: 0, modId: 'fuel-dump' })
  })

  it('1: uses the Sports guaranteed heads but never counts on a real flip', () => {
    // Nitrous heads is +200. At 900 ft the Miata needs 188 more than its 232.
    const sports = duel(
      { cars: [{ id: MIATA, fuel: 2 }], hand: ['nitrous-shot'] },
      {},
      { distanceFt: [900, 0] },
    )
    expect(chooseAction(sports, 0)).toEqual({ type: 'playBoost', player: 0, modId: 'nitrous-shot' })
    const civic = duel(
      { cars: [{ id: CIVIC, fuel: 2 }], hand: ['nitrous-shot'] },
      {},
      { distanceFt: [950, 0] },
    )
    const nitrous = {
      mod: getMod('nitrous-shot'),
      action: { type: 'playBoost', player: 0, modId: 'nitrous-shot' } as const,
    }
    expect(forecastOwnAdvance(civic, 0, nitrous).wins).toBe(false)
    expect(chooseAction(civic, 0)).toEqual({ type: 'endMods', player: 0 })
  })

  it('2: plays a Sabotage that stops a winning advance', () => {
    // The Miata at 1150 wins next turn with 232. Wheelspin leaves 132; Bad Tune leaves 208.
    const state = duel({ hand: ['bad-tune', 'wheelspin'] }, {}, { distanceFt: [0, 1150] })
    expect(forecastOpponentAdvance(state, 0).wins).toBe(true)
    expect(chooseAction(state, 0)).toEqual({ type: 'playSabotage', player: 0, modId: 'wheelspin' })
  })

  it('2: does not waste Traction sabotage on an immune car', () => {
    const state = duel(
      { hand: ['wheelspin'] },
      { cars: [{ id: WRX, fuel: 2 }] },
      { distanceFt: [0, 1100] },
    )
    expect(forecastOpponentAdvance(state, 0).wins).toBe(true)
    expect(forecastOpponentAdvance(state, 0, getMod('wheelspin')).wins).toBe(true)
    expect(chooseAction(state, 0)).toEqual({ type: 'endMods', player: 0 })
  })

  it('3: fuels the staged car when it is under its cost', () => {
    const state = duel(
      { cars: [{ id: MUSTANG, fuel: 1 }, { id: CIVIC }, { id: GTR }] },
      {},
      { step: 'fuel' },
    )
    expect(chooseAction(state, 0)).toEqual({ type: 'fuel', player: 0, carId: MUSTANG })
  })

  it('3: otherwise fuels the garage car with the best advance per fuel remaining', () => {
    // Civic: 203 ft for 1 fuel. GT-R: 430 ft for 3 fuel, so 143 per fuel.
    const far = duel(
      { cars: [{ id: MUSTANG, fuel: 2 }, { id: CIVIC }, { id: GTR }] },
      {},
      { step: 'fuel' },
    )
    expect(chooseAction(far, 0)).toEqual({ type: 'fuel', player: 0, carId: CIVIC })
    // With two fuel already on it the GT-R is 430 ft for 1 more.
    const near = duel(
      { cars: [{ id: MUSTANG, fuel: 2 }, { id: CIVIC }, { id: GTR, fuel: 2 }] },
      {},
      { step: 'fuel' },
    )
    expect(chooseAction(near, 0)).toEqual({ type: 'fuel', player: 0, carId: GTR })
  })

  it('4: attaches Parts to the car with the most races likely left in it', () => {
    const state = duel({
      cars: [
        { id: CIVIC, fuel: 1, wear: 2 },
        { id: MUSTANG, wear: 0 },
        { id: GTR, wear: 1 },
      ],
      hand: ['turbo-kit'],
    })
    expect(chooseAction(state, 0)).toEqual({
      type: 'playPart',
      player: 0,
      modId: 'turbo-kit',
      carId: MUSTANG,
    })
  })

  it('4: keeps a Part that would do nothing', () => {
    // Fuel Cell cannot lower a Daily car below 1, and a Wheelie Bar adds nothing to Off-road.
    const daily = duel({ cars: [{ id: CIVIC, fuel: 1 }, { id: MIATA }], hand: ['fuel-cell'] })
    expect(chooseAction(daily, 0)).toEqual({ type: 'endMods', player: 0 })
    const offroad = duel({ cars: [{ id: WRX, fuel: 2 }], hand: ['wheelie-bar'] })
    expect(chooseAction(offroad, 0)).toEqual({ type: 'endMods', player: 0 })
    const worthIt = duel({ cars: [{ id: CIVIC, fuel: 1 }, { id: GTR }], hand: ['fuel-cell'] })
    expect(chooseAction(worthIt, 0)).toEqual({
      type: 'playPart',
      player: 0,
      modId: 'fuel-cell',
      carId: GTR,
    })
  })

  it('5: between races stages the car with the highest ready advance, preferring lower wear', () => {
    const base = duel({
      cars: [
        { id: CIVIC, fuel: 1 },
        { id: MUSTANG, fuel: 2 },
        { id: GTR, fuel: 3 },
      ],
    })
    const staging = { ...base, phase: { kind: 'staging' as const, pending: [0 as const] } }
    expect(chooseAction(staging, 0)).toEqual({ type: 'stage', player: 0, carId: GTR })

    const worn = duel({
      cars: [
        { id: CIVIC, fuel: 1 },
        { id: MUSTANG, fuel: 2 },
        { id: GTR, fuel: 3, wear: 3 },
      ],
    })
    const wornStaging = { ...worn, phase: { kind: 'staging' as const, pending: [0 as const] } }
    // 430 × 0.7 is 301 ft, below the Mustang's 372.
    expect(readyAdvance({ carId: GTR, fuel: 3, wear: 3, parts: [], tractionShield: false })).toBe(
      301,
    )
    expect(chooseAction(wornStaging, 0)).toEqual({ type: 'stage', player: 0, carId: MUSTANG })

    const unready = duel({
      cars: [
        { id: CIVIC, fuel: 1 },
        { id: GTR, fuel: 0 },
      ],
    })
    const unreadyStaging = {
      ...unready,
      phase: { kind: 'staging' as const, pending: [0 as const] },
    }
    expect(chooseAction(unreadyStaging, 0)).toEqual({ type: 'stage', player: 0, carId: CIVIC })
  })
})

describe('CPU defaults beyond the priorities', () => {
  it('never plays a Boost that leaves the staged car unable to advance', () => {
    const state = duel({ cars: [{ id: CIVIC, fuel: 1 }], hand: ['fuel-dump', 'nitrous-shot'] })
    expect(chooseAction(state, 0)).toEqual({ type: 'endMods', player: 0 })
  })

  it('plays a distance Boost worth the threshold on an advance it will make', () => {
    const state = duel({ hand: ['power-shift'] })
    expect(chooseAction(state, 0)).toEqual({ type: 'playBoost', player: 0, modId: 'power-shift' })
    const wasted = duel({ cars: [{ id: MUSTANG, fuel: 1 }], hand: ['power-shift'] })
    expect(chooseAction(wasted, 0)).toEqual({ type: 'endMods', player: 0 })
  })

  it('tops up its staged car with Tow Truck to make an advance it could not', () => {
    const state = duel({
      cars: [
        { id: MUSTANG, fuel: 1 },
        { id: CIVIC, fuel: 2 },
      ],
      hand: ['tow-truck'],
    })
    expect(chooseAction(state, 0)).toEqual({
      type: 'playBoost',
      player: 0,
      modId: 'tow-truck',
      fromCarId: CIVIC,
      toCarId: MUSTANG,
    })
  })

  it('places fuel owed by Extra Tank with the same rule as the fuel step', () => {
    let state = duel({ cars: [{ id: MUSTANG, fuel: 1 }, { id: CIVIC }], hand: ['extra-tank'] })
    const first = chooseAction(state, 0)
    expect(first).toEqual({ type: 'playBoost', player: 0, modId: 'extra-tank' })
    state = apply(state, first)
    expect(chooseAction(state, 0)).toEqual({ type: 'fuel', player: 0, carId: MUSTANG })
  })

  it('gives up its least valuable Part to Parts Thief', () => {
    const base = duel(
      {},
      { cars: [{ id: MIATA, fuel: 1, parts: ['carbon-body-kit', 'turbo-kit'] }] },
    )
    const choice = {
      ...base,
      phase: {
        kind: 'choice' as const,
        player: 1 as const,
        choice: { kind: 'discardPart' as const, carId: MIATA },
      },
    }
    // Carbon Body Kit adds 16 ft to the Miata, Turbo Kit adds 46.
    expect(chooseAction(choice, 1)).toEqual({
      type: 'discardPart',
      player: 1,
      modId: 'carbon-body-kit',
    })
  })

  it('ends the mod step when nothing is worth playing', () => {
    const state = duel({ hand: ['perfect-launch', 'two-step'] }, {}, { advances: [1, 0] })
    expect(chooseAction(state, 0)).toEqual({ type: 'endMods', player: 0 })
  })
})

describe('CPU determinism and legality', () => {
  it('returns the same action for the same state and seed', () => {
    const state = duel({ hand: ['power-shift', 'pit-crew', 'turbo-kit', 'wheelspin'] })
    expect(chooseAction(state, 0, 7)).toEqual(chooseAction(state, 0, 7))
    for (const seed of [1, 2, 3]) {
      expect(isLegal(state, chooseAction(state, 0, seed))).toBe(true)
    }
  })

  it('always returns a legal action for whoever must act', () => {
    let state = duel(
      {
        hand: ['extra-tank', 'tow-truck', 'sponsor', 'parts-thief'],
        deck: ['turbo-kit', 'aero-package', 'redline'],
      },
      { cars: [{ id: MIATA, fuel: 1, parts: ['drag-slicks', 'aero-package'] }, { id: GTR }] },
    )
    for (let i = 0; i < 60 && isOver(state) === null; i++) {
      const player = currentPlayer(state)
      if (player === null) break
      const action = chooseAction(state, player, i)
      expect(legalActions(state, player)).toContainEqual(action)
      state = apply(state, action)
    }
  })

  it('completes 1,000 CPU versus CPU matches with no illegal action and no exception', () => {
    const pairings: Array<[number, number]> = [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 0],
      [0, 2],
    ]
    let played = 0
    let totalTurns = 0
    const wins = [0, 0]
    for (let seed = 1; played < 1000; seed++) {
      for (const [a, b] of pairings) {
        if (played >= 1000) break
        const result = playCpuMatch(starterConfig(a, b), seed)
        expect(result.winner).not.toBeNull()
        expect(result.state.players[result.winner].pinkSlips).toHaveLength(TUNABLES.pinkSlipsToWin)
        played++
        totalTurns += result.turns
        wins[result.winner] = (wins[result.winner] ?? 0) + 1
      }
    }
    expect(played).toBe(1000)
    // Sanity: matches end in a reasonable number of turns, and neither seat always wins.
    expect(totalTurns / played).toBeLessThan(120)
    expect(Math.min(wins[0] ?? 0, wins[1] ?? 0)).toBeGreaterThan(100)
  }, 120000)

  it('plays mods during a real match', () => {
    const config: MatchConfig = starterConfig(0, 1)
    const result = playCpuMatch(config, 3)
    const kinds = new Set(result.state.log.map((entry) => entry.kind))
    expect(kinds.has('playPart') || kinds.has('playBoost') || kinds.has('playSabotage')).toBe(true)
    expect(STARTERS.length).toBe(3)
  })
})
