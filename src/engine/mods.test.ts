import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { computeAdvance, type AdvanceInput } from './advance.ts'
import { apply, currentPlayer, isOver, legalActions, stagedCar } from './match.ts'
import { fuelCost } from './mods.ts'
import { flipCoin, seedRng } from './rng.ts'
import {
  endModsAndAdvance,
  playTurn,
  scenario,
  type PlayerSpec,
  type ScenarioSpec,
} from './test-helpers.ts'
import type { Action, MatchState, PlayerIndex } from './types.ts'

/**
 * One test per mod proving its effect and its limit (BUILD_PLAN phase 3). Scenarios put
 * player 0 in the mod step of turn 2 with a fueled Daily car so an advance follows.
 */

const CIVIC = 'honda-civic-si' // JDM, Daily, cost 1
const MIATA = 'mazda-mx-5-miata' // Sports, Daily, cost 1
const MUSTANG = 'ford-mustang-gt' // Muscle, Performance, cost 2
const PLAID = 'tesla-model-s-plaid' // EV, Hyper, cost 6
const LC500 = 'lexus-lc-500' // Luxury, Performance, cost 2
const WRX = 'subaru-wrx-sti' // Off-road, Performance, cost 2
const GTR = 'nissan-gt-r' // JDM, Super, cost 4

function baseFt(carId: string, overrides: Partial<AdvanceInput> = {}): number {
  return computeAdvance({
    car: getCar(carId),
    wear: 0,
    startFt: 0,
    isFirstAdvanceOfRace: false,
    ...overrides,
  }).finalFt
}

function duel(
  p0: Partial<PlayerSpec> = {},
  p1: Partial<PlayerSpec> = {},
  extra: Partial<ScenarioSpec> = {},
): MatchState {
  return scenario({
    players: [
      { cars: [{ id: CIVIC, fuel: 1 }, { id: MUSTANG }], ...p0 },
      { cars: [{ id: MIATA, fuel: 1 }, { id: LC500 }], ...p1 },
    ],
    ...extra,
  })
}

function plays(state: MatchState, player: PlayerIndex, modId: string): Action[] {
  return legalActions(state, player).filter((a) => 'modId' in a && a.modId === modId)
}

function boost(state: MatchState, modId: string, extra: Partial<Action> = {}): MatchState {
  return apply(state, { type: 'playBoost', player: 0, modId, ...extra } as Action)
}

function sabotage(state: MatchState, modId: string): MatchState {
  return apply(state, { type: 'playSabotage', player: 0, modId })
}

function part(state: MatchState, modId: string, carId: string): MatchState {
  return apply(state, { type: 'playPart', player: 0, modId, carId })
}

/** Distance player 0's staged car covers when its mod step ends now. */
function advanceFt(state: MatchState): number {
  const next = endModsAndAdvance(state, 0)
  return next.race.distanceFt[0] - state.race.distanceFt[0]
}

/** A seed whose first coin flip lands the given way. */
function seedFor(heads: boolean): number {
  for (let seed = 1; seed < 100; seed++) {
    if (flipCoin(seedRng(seed))[0] === heads) return seed
  }
  throw new Error('no seed')
}

describe('Parts', () => {
  it.each([
    ['turbo-kit', 0.2],
    ['supercharger', 0.25],
    ['stage-2-tune', 0.1],
  ])('%s adds %d to the hp percent sum', (modId, hpPercent) => {
    let state = duel({ cars: [{ id: CIVIC, fuel: 1 }], hand: [modId] })
    state = part(state, modId, CIVIC)
    expect(stagedCar(state, 0)?.parts).toEqual([modId])
    expect(state.players[0].hand).toEqual([])
    expect(advanceFt(state)).toBe(baseFt(CIVIC, { hpPercent }))
  })

  it('hp percent Parts stack additively', () => {
    let state = duel({ cars: [{ id: CIVIC, fuel: 1 }], hand: ['turbo-kit', 'stage-2-tune'] })
    state = part(state, 'turbo-kit', CIVIC)
    state = part(state, 'stage-2-tune', CIVIC)
    expect(advanceFt(state)).toBe(baseFt(CIVIC, { hpPercent: 0.3 }))
  })

  it.each([
    ['weight-reduction', 300],
    ['carbon-body-kit', 150],
  ])('%s takes %d lb off the effective weight', (modId, weightReductionLb) => {
    let state = duel({ cars: [{ id: CIVIC, fuel: 1 }], hand: [modId] })
    state = part(state, modId, CIVIC)
    expect(advanceFt(state)).toBe(baseFt(CIVIC, { weightReductionLb }))
  })

  it('drag-slicks adds 100 ft on the first advance of a race only', () => {
    const withSlicks = duel({ cars: [{ id: CIVIC, fuel: 1, parts: ['drag-slicks'] }] })
    expect(advanceFt(withSlicks)).toBe(baseFt(CIVIC) + 100)
    const later = duel(
      { cars: [{ id: CIVIC, fuel: 1, parts: ['drag-slicks'] }] },
      {},
      { advances: [1, 0] },
    )
    expect(advanceFt(later)).toBe(baseFt(CIVIC))
  })

  it('aero-package adds 50 ft on advances that start at or past 660 ft', () => {
    const car = { id: CIVIC, fuel: 1, parts: ['aero-package'] }
    expect(advanceFt(duel({ cars: [car] }, {}, { distanceFt: [660, 0] }))).toBe(baseFt(CIVIC) + 50)
    expect(advanceFt(duel({ cars: [car] }, {}, { distanceFt: [659, 0] }))).toBe(baseFt(CIVIC))
  })

  it('fuel-cell lowers fuel cost by 1 to a minimum of 1', () => {
    const cost = (id: string, parts: string[]) =>
      fuelCost({ carId: id, fuel: 0, wear: 0, parts, tractionShield: false })
    expect(cost(MUSTANG, [])).toBe(2)
    expect(cost(MUSTANG, ['fuel-cell'])).toBe(1)
    expect(cost(CIVIC, ['fuel-cell'])).toBe(1)
    expect(cost(GTR, ['fuel-cell', 'fuel-cell'])).toBe(2)
    // A Mustang with one fuel and a Fuel Cell can advance.
    const state = duel({ cars: [{ id: MUSTANG, fuel: 1, parts: ['fuel-cell'] }] })
    expect(advanceFt(state)).toBe(baseFt(MUSTANG))
  })

  it('roll-cage stops the car gaining wear when it wins a race', () => {
    const win = (parts: string[]) => {
      const state = duel(
        { cars: [{ id: PLAID, fuel: 6, parts }, { id: CIVIC }] },
        {},
        { distanceFt: [700, 0], advances: [1, 0] },
      )
      const next = endModsAndAdvance(state, 0)
      expect(next.log.some((e) => e.kind === 'raceEnd')).toBe(true)
      return next.players[0].garage.find((c) => c.carId === PLAID)?.wear
    }
    expect(win([])).toBe(1)
    expect(win(['roll-cage'])).toBe(0)
  })

  it('wheelie-bar makes the car ignore Traction sabotage', () => {
    const state = duel({
      cars: [{ id: CIVIC, fuel: 1, parts: ['wheelie-bar'] }],
      pending: { flatReductionFt: 100, halve: true },
    })
    expect(advanceFt(state)).toBe(baseFt(CIVIC))
    const next = endModsAndAdvance(state, 0)
    expect(next.log.some((e) => e.kind === 'tractionIgnored' && e.reason === 'immune')).toBe(true)
  })

  it('a Part can go on a bench car and stays there', () => {
    let state = duel({ hand: ['turbo-kit'] })
    expect(plays(state, 0, 'turbo-kit').map((a) => ('carId' in a ? a.carId : ''))).toEqual([
      CIVIC,
      MUSTANG,
    ])
    state = part(state, 'turbo-kit', MUSTANG)
    expect(state.players[0].garage.find((c) => c.carId === MUSTANG)?.parts).toEqual(['turbo-kit'])
    expect(advanceFt(state)).toBe(baseFt(CIVIC))
  })

  it('limit: no Part goes into a car with no open slot', () => {
    const state = duel({
      cars: [{ id: MIATA, fuel: 1, parts: ['turbo-kit', 'stage-2-tune'] }],
      hand: ['supercharger'],
    })
    expect(plays(state, 0, 'supercharger')).toEqual([])
    expect(() => part(state, 'supercharger', MIATA)).toThrow(/Illegal/)
  })
})

describe('Boosts', () => {
  it('nitrous-shot costs 1 fuel and adds 200 ft on heads or 50 ft on tails', () => {
    for (const [heads, bonus] of [
      [true, 200],
      [false, 50],
    ] as const) {
      let state = duel(
        { cars: [{ id: CIVIC, fuel: 2 }], hand: ['nitrous-shot'] },
        {},
        { seed: seedFor(heads) },
      )
      state = boost(state, 'nitrous-shot')
      expect(stagedCar(state, 0)?.fuel).toBe(1)
      expect(state.players[0].discard).toEqual(['nitrous-shot'])
      expect(advanceFt(state)).toBe(baseFt(CIVIC) + bonus)
    }
  })

  it('limit: a fuel-cost Boost needs the fuel on the staged car', () => {
    const state = duel({ cars: [{ id: CIVIC, fuel: 0 }], hand: ['nitrous-shot', 'fuel-dump'] })
    expect(plays(state, 0, 'nitrous-shot')).toEqual([])
    expect(plays(state, 0, 'fuel-dump')).toEqual([])
  })

  it('power-shift adds 100 ft to this advance', () => {
    const state = boost(duel({ hand: ['power-shift'] }), 'power-shift')
    expect(advanceFt(state)).toBe(baseFt(CIVIC) + 100)
  })

  it('limit: only one Boost per turn', () => {
    let state = duel({ hand: ['power-shift', 'power-shift', 'pit-crew'] })
    state = boost(state, 'power-shift')
    expect(plays(state, 0, 'power-shift')).toEqual([])
    expect(plays(state, 0, 'pit-crew')).toEqual([])
    expect(() => boost(state, 'power-shift')).toThrow(/Illegal/)
  })

  it('perfect-launch adds 150 ft only on the first advance of the race', () => {
    const first = boost(duel({ hand: ['perfect-launch'] }), 'perfect-launch')
    expect(advanceFt(first)).toBe(baseFt(CIVIC) + 150)
    const later = boost(
      duel({ hand: ['perfect-launch'] }, {}, { advances: [1, 0] }),
      'perfect-launch',
    )
    expect(advanceFt(later)).toBe(baseFt(CIVIC))
  })

  it('redline adds 50% to this advance, then the car gains 1 wear', () => {
    const state = boost(duel({ hand: ['redline'] }), 'redline')
    expect(stagedCar(state, 0)?.wear).toBe(0)
    expect(advanceFt(state)).toBe(Math.floor(baseFt(CIVIC) * 1.5))
    expect(stagedCar(endModsAndAdvance(state, 0), 0)?.wear).toBe(1)
  })

  it('fuel-dump removes 1 fuel from the staged car for 250 ft', () => {
    const state = boost(duel({ cars: [{ id: CIVIC, fuel: 2 }], hand: ['fuel-dump'] }), 'fuel-dump')
    expect(stagedCar(state, 0)?.fuel).toBe(1)
    expect(advanceFt(state)).toBe(baseFt(CIVIC) + 250)
  })

  it('overdrive on heads advances a second time at half distance, on tails does nothing', () => {
    // The Miata is Sports, so its first flip of the race is heads.
    const heads = boost(duel({ cars: [{ id: MIATA, fuel: 1 }], hand: ['overdrive'] }), 'overdrive')
    expect(advanceFt(heads)).toBe(baseFt(MIATA) + Math.floor(baseFt(MIATA) / 2))
    expect(endModsAndAdvance(heads, 0).race.advances[0]).toBe(2)

    const tails = boost(duel({ hand: ['overdrive'] }, {}, { seed: seedFor(false) }), 'overdrive')
    expect(advanceFt(tails)).toBe(baseFt(CIVIC))
  })

  it('launch-control shields the next advance from Traction sabotage, then is used up', () => {
    let state = duel({ hand: ['launch-control'], pending: { halve: true, flatReductionFt: 50 } })
    state = boost(state, 'launch-control')
    expect(stagedCar(state, 0)?.tractionShield).toBe(true)
    expect(advanceFt(state)).toBe(baseFt(CIVIC))
    const next = endModsAndAdvance(state, 0)
    expect(stagedCar(next, 0)?.tractionShield).toBe(false)
    expect(next.log.some((e) => e.kind === 'tractionIgnored' && e.reason === 'shield')).toBe(true)
  })

  it('extra-tank owes one more fuel placement before the mod step can end', () => {
    let state = boost(duel({ hand: ['extra-tank'] }), 'extra-tank')
    expect(state.turn.extraFuel).toBe(1)
    const types = new Set(legalActions(state, 0).map((a) => a.type))
    expect(types.has('fuel')).toBe(true)
    expect(types.has('endMods')).toBe(false)
    state = apply(state, { type: 'fuel', player: 0, carId: MUSTANG })
    expect(state.players[0].garage.find((c) => c.carId === MUSTANG)?.fuel).toBe(1)
    expect(state.turn.step).toBe('mods')
    expect(legalActions(state, 0).some((a) => a.type === 'endMods')).toBe(true)
    expect(legalActions(state, 0).some((a) => a.type === 'fuel')).toBe(false)
  })

  it('tow-truck moves every fuel token from one of your cars to another', () => {
    let state = duel({
      cars: [
        { id: CIVIC, fuel: 1 },
        { id: MUSTANG, fuel: 3 },
      ],
      hand: ['tow-truck'],
    })
    const options = plays(state, 0, 'tow-truck')
    expect(options).toContainEqual({
      type: 'playBoost',
      player: 0,
      modId: 'tow-truck',
      fromCarId: MUSTANG,
      toCarId: CIVIC,
    })
    expect(options).toContainEqual({
      type: 'playBoost',
      player: 0,
      modId: 'tow-truck',
      fromCarId: CIVIC,
      toCarId: MUSTANG,
    })
    state = boost(state, 'tow-truck', { fromCarId: MUSTANG, toCarId: CIVIC })
    expect(stagedCar(state, 0)?.fuel).toBe(4)
    expect(state.players[0].garage.find((c) => c.carId === MUSTANG)?.fuel).toBe(0)
  })

  it('limit: tow-truck needs a car with fuel to take from', () => {
    const state = duel({ cars: [{ id: CIVIC, fuel: 0 }, { id: MUSTANG }], hand: ['tow-truck'] })
    expect(plays(state, 0, 'tow-truck')).toEqual([])
  })

  it('pit-crew draws 2 cards', () => {
    const state = boost(
      duel({ hand: ['pit-crew'], deck: ['wheelspin', 'turbo-kit', 'redline'] }),
      'pit-crew',
    )
    expect(state.players[0].hand).toEqual(['wheelspin', 'turbo-kit'])
    expect(state.players[0].deck).toEqual(['redline'])
  })

  it('sponsor takes a Part from the deck into the hand and shuffles', () => {
    let state = duel({
      hand: ['sponsor'],
      deck: ['wheelspin', 'turbo-kit', 'power-shift', 'turbo-kit'],
    })
    expect(plays(state, 0, 'sponsor')).toEqual([
      { type: 'playBoost', player: 0, modId: 'sponsor', targetModId: 'turbo-kit' },
    ])
    state = boost(state, 'sponsor', { targetModId: 'turbo-kit' })
    expect(state.players[0].hand).toEqual(['turbo-kit'])
    expect([...state.players[0].deck].sort()).toEqual(['power-shift', 'turbo-kit', 'wheelspin'])

    const empty = duel({ hand: ['sponsor'], deck: ['wheelspin'] })
    expect(plays(empty, 0, 'sponsor')).toEqual([{ type: 'playBoost', player: 0, modId: 'sponsor' }])
    expect(boost(empty, 'sponsor').players[0].hand).toEqual([])
  })

  it('two-step is Muscle only and adds 150 ft on the first advance', () => {
    const muscle = boost(duel({ cars: [{ id: MUSTANG, fuel: 2 }], hand: ['two-step'] }), 'two-step')
    expect(advanceFt(muscle)).toBe(baseFt(MUSTANG) + 150)
    expect(plays(duel({ hand: ['two-step'] }), 0, 'two-step')).toEqual([])
  })

  it('anti-lag is JDM only and adds 5% hp per Part this advance', () => {
    const jdm = boost(
      duel({
        cars: [{ id: CIVIC, fuel: 1, parts: ['turbo-kit', 'stage-2-tune'] }],
        hand: ['anti-lag'],
      }),
      'anti-lag',
    )
    expect(advanceFt(jdm)).toBe(baseFt(CIVIC, { hpPercent: 0.3 + 0.1 }))
    expect(
      plays(duel({ cars: [{ id: MUSTANG, fuel: 2 }], hand: ['anti-lag'] }), 0, 'anti-lag'),
    ).toEqual([])
  })

  it('regen is EV only and places one fuel on the staged car', () => {
    const ev = boost(duel({ cars: [{ id: PLAID, fuel: 0 }], hand: ['regen'] }), 'regen')
    expect(stagedCar(ev, 0)?.fuel).toBe(1)
    expect(plays(duel({ hand: ['regen'] }), 0, 'regen')).toEqual([])
  })
})

describe('Sabotage', () => {
  /** Player 0 plays a Sabotage, then player 1 takes a turn fueling its staged car. */
  function afterSabotage(
    modId: string,
    p1: Partial<PlayerSpec> = {},
    extra: Partial<ScenarioSpec> = {},
  ) {
    let state = sabotage(duel({ hand: [modId] }, p1, extra), modId)
    state = endModsAndAdvance(state, 0)
    expect(state.turn.player).toBe(1)
    return { state, after: playTurn(state) }
  }

  it("wheelspin takes 100 ft off the opponent's next advance", () => {
    const { state, after } = afterSabotage('wheelspin')
    expect(state.players[1].pendingSabotage.flatReductionFt).toBe(100)
    expect(after.race.distanceFt[1]).toBe(baseFt(MIATA) - 100)
    expect(after.players[1].pendingSabotage.flatReductionFt).toBe(0)
  })

  it('limit: only one Sabotage per turn', () => {
    let state = duel({ hand: ['wheelspin', 'bad-tune'] })
    state = sabotage(state, 'wheelspin')
    expect(plays(state, 0, 'bad-tune')).toEqual([])
    expect(() => sabotage(state, 'bad-tune')).toThrow(/Illegal/)
  })

  it('pending sabotage waits for the next advance if the car cannot advance yet', () => {
    // The LC 500 costs 2 fuel, so one placement leaves it short and the sabotage stays pending.
    const { after } = afterSabotage('wheelspin', { cars: [{ id: LC500, fuel: 0 }] })
    expect(after.race.distanceFt[1]).toBe(0)
    expect(after.players[1].pendingSabotage.flatReductionFt).toBe(100)
  })

  it("missed-shift halves the opponent's next advance after flat reductions", () => {
    const { after } = afterSabotage('missed-shift')
    expect(after.race.distanceFt[1]).toBe(Math.floor(baseFt(MIATA) / 2))
    const both = afterSabotage('missed-shift', { pending: { flatReductionFt: 100 } })
    expect(both.after.race.distanceFt[1]).toBe(Math.floor((baseFt(MIATA) - 100) / 2))
  })

  it('red-light makes a car that has not advanced this race skip its next advance', () => {
    const { after } = afterSabotage('red-light')
    expect(after.race.distanceFt[1]).toBe(0)
    expect(after.log.some((e) => e.kind === 'advanceSkipped' && e.reason === 'redLight')).toBe(true)
    expect(after.players[1].pendingSabotage.skipAdvance).toBe(false)
    expect(after.turn.player).toBe(0)

    const moved = afterSabotage('red-light', {}, { advances: [0, 1] })
    expect(moved.state.players[1].pendingSabotage.skipAdvance).toBe(false)
    expect(moved.after.race.distanceFt[1]).toBe(baseFt(MIATA))
  })

  it('oil-slick takes 50 ft off, and 50 more on heads', () => {
    let state = sabotage(duel({ hand: ['oil-slick'] }, {}, { seed: seedFor(false) }), 'oil-slick')
    expect(state.players[1].pendingSabotage.flatReductionFt).toBe(50)
    state = sabotage(duel({ hand: ['oil-slick'] }, {}, { seed: seedFor(true) }), 'oil-slick')
    expect(state.players[1].pendingSabotage.flatReductionFt).toBe(100)
  })

  it("fuel-siphon removes 1 fuel from the opponent's staged car, never below 0", () => {
    expect(stagedCar(sabotage(duel({ hand: ['fuel-siphon'] }), 'fuel-siphon'), 1)?.fuel).toBe(0)
    const empty = duel({ hand: ['fuel-siphon'] }, { cars: [{ id: MIATA, fuel: 0 }] })
    expect(stagedCar(sabotage(empty, 'fuel-siphon'), 1)?.fuel).toBe(0)
  })

  it("parts-thief discards a Part from the opponent's staged car, their choice", () => {
    const one = sabotage(
      duel({ hand: ['parts-thief'] }, { cars: [{ id: MIATA, parts: ['turbo-kit'] }] }),
      'parts-thief',
    )
    expect(stagedCar(one, 1)?.parts).toEqual([])
    expect(one.players[1].discard).toEqual(['turbo-kit'])
    expect(one.phase).toEqual({ kind: 'turn' })

    const two = sabotage(
      duel(
        { hand: ['parts-thief'] },
        { cars: [{ id: MIATA, parts: ['turbo-kit', 'aero-package'] }] },
      ),
      'parts-thief',
    )
    expect(two.phase).toEqual({
      kind: 'choice',
      player: 1,
      choice: { kind: 'discardPart', carId: MIATA },
    })
    expect(currentPlayer(two)).toBe(1)
    expect(legalActions(two, 0)).toEqual([])
    expect(legalActions(two, 1)).toEqual([
      { type: 'discardPart', player: 1, modId: 'turbo-kit' },
      { type: 'discardPart', player: 1, modId: 'aero-package' },
    ])
    const chosen = apply(two, { type: 'discardPart', player: 1, modId: 'aero-package' })
    expect(stagedCar(chosen, 1)?.parts).toEqual(['turbo-kit'])
    expect(chosen.players[1].discard).toEqual(['aero-package'])
    expect(chosen.phase).toEqual({ kind: 'turn' })
    expect(chosen.turn.player).toBe(0)
    expect(chosen.turn.step).toBe('mods')

    const none = sabotage(duel({ hand: ['parts-thief'] }), 'parts-thief')
    expect(none.phase).toEqual({ kind: 'turn' })
  })

  it('roadblock stops the opponent playing a Boost on their next turn only', () => {
    let state = sabotage(duel({ hand: ['roadblock'] }, { hand: ['power-shift'] }), 'roadblock')
    expect(state.players[1].boostBlockedNextTurn).toBe(true)
    state = endModsAndAdvance(state, 0)
    expect(state.turn).toMatchObject({ player: 1, boostBlocked: true })
    state = apply(state, { type: 'fuel', player: 1, carId: MIATA })
    expect(plays(state, 1, 'power-shift')).toEqual([])
    state = endModsAndAdvance(state, 1)
    state = playTurn(state) // player 0
    expect(state.turn).toMatchObject({ player: 1, boostBlocked: false })
    state = apply(state, { type: 'fuel', player: 1, carId: MIATA })
    expect(plays(state, 1, 'power-shift')).toHaveLength(1)
  })

  it("bad-tune gives the opponent's staged car 1 wear", () => {
    expect(stagedCar(sabotage(duel({ hand: ['bad-tune'] }), 'bad-tune'), 1)?.wear).toBe(1)
  })

  it('pending sabotage is cleared at race end (DESIGN.md 3.4)', () => {
    const state = duel(
      { cars: [{ id: PLAID, fuel: 6 }, { id: CIVIC }], pending: { flatReductionFt: 10 } },
      { pending: { halve: true, flatReductionFt: 100, skipAdvance: true } },
      { distanceFt: [700, 0], advances: [1, 0] },
    )
    const next = endModsAndAdvance(state, 0)
    expect(next.phase.kind).toBe('staging')
    expect(next.players[0].pendingSabotage).toEqual({
      flatReductionFt: 0,
      halve: false,
      skipAdvance: false,
    })
    expect(next.players[1].pendingSabotage).toEqual({
      flatReductionFt: 0,
      halve: false,
      skipAdvance: false,
    })
  })

  it("a captured car's parts go to the loser's discard pile", () => {
    const state = duel(
      { cars: [{ id: PLAID, fuel: 6 }, { id: CIVIC }] },
      { cars: [{ id: MIATA, parts: ['turbo-kit'] }, { id: LC500 }] },
      { distanceFt: [700, 0], advances: [1, 0] },
    )
    const next = endModsAndAdvance(state, 0)
    expect(next.players[1].discard).toEqual(['turbo-kit'])
    expect(next.players[0].pinkSlips).toEqual([MIATA])
  })
})

describe('legalActions rejections (BUILD_PLAN phase 3)', () => {
  it('rejects a second Boost', () => {
    const state = boost(duel({ hand: ['power-shift', 'pit-crew'] }), 'power-shift')
    expect(legalActions(state, 0).filter((a) => a.type === 'playBoost')).toEqual([])
  })

  it('rejects a second Sabotage', () => {
    const state = sabotage(duel({ hand: ['wheelspin', 'bad-tune'] }), 'wheelspin')
    expect(legalActions(state, 0).filter((a) => a.type === 'playSabotage')).toEqual([])
  })

  it('rejects a Part into a full car', () => {
    const state = duel({
      cars: [{ id: MUSTANG, fuel: 2, parts: ['turbo-kit', 'stage-2-tune'] }],
      hand: ['aero-package'],
    })
    expect(legalActions(state, 0).filter((a) => a.type === 'playPart')).toEqual([])
  })

  it('rejects a type-locked mod on the wrong type', () => {
    const state = duel({ cars: [{ id: LC500, fuel: 2 }], hand: ['two-step', 'anti-lag', 'regen'] })
    expect(legalActions(state, 0).filter((a) => a.type === 'playBoost')).toEqual([])
    expect(() => boost(state, 'regen')).toThrow(/Illegal/)
  })
})

describe('mods in a full match', () => {
  it('a mod-heavy match still plays to a winner', () => {
    let state = duel(
      {
        cars: [{ id: CIVIC, fuel: 1 }, MUSTANG, GTR],
        hand: ['power-shift'],
        deck: ['wheelspin', 'turbo-kit', 'pit-crew', 'redline', 'overdrive', 'nitrous-shot'],
      },
      {
        cars: [{ id: WRX, fuel: 2 }, MIATA, LC500],
        hand: ['red-light'],
        deck: ['drag-slicks', 'sponsor', 'extra-tank', 'bad-tune', 'roadblock', 'parts-thief'],
      },
    )
    for (let i = 0; i < 5000 && isOver(state) === null; i++) {
      const player = currentPlayer(state)
      if (player === null) break
      const actions = legalActions(state, player)
      const action = actions[0]
      if (!action) throw new Error('stuck')
      state = apply(state, action)
    }
    expect(isOver(state)).not.toBeNull()
  })
})
