import { describe, expect, it } from 'vitest'
import { getCar } from '../data/cars.ts'
import { computeAdvance } from './advance.ts'
import { apply, legalActions, stagedCar } from './match.ts'
import { openSlots, partSlots } from './mods.ts'
import { endModsAndAdvance, scenario, stageBoth, type PlayerSpec } from './test-helpers.ts'
import { TUNABLES } from './tunables.ts'
import type { MatchState } from './types.ts'

/** One test per type identity from DESIGN.md 2.3, each played through the match engine. */

const CIVIC = 'honda-civic-si' // JDM
const MIATA = 'mazda-mx-5-miata' // Sports
const MUSTANG = 'ford-mustang-gt' // Muscle
const PLAID = 'tesla-model-s-plaid' // EV
const LC500 = 'lexus-lc-500' // Luxury
const WRX = 'subaru-wrx-sti' // Off-road

function base(carId: string): number {
  return computeAdvance({ car: getCar(carId), wear: 0, startFt: 0, isFirstAdvanceOfRace: false })
    .baseFt
}

function versusCivic(
  p0: PlayerSpec,
  extra: Parameters<typeof scenario>[0] extends infer S ? Partial<S> : never = {},
): MatchState {
  return scenario({ players: [p0, { cars: [{ id: CIVIC, fuel: 1 }] }], ...extra })
}

function advanceFt(state: MatchState): number {
  return endModsAndAdvance(state, 0).race.distanceFt[0] - state.race.distanceFt[0]
}

describe('type identities (DESIGN.md 2.3)', () => {
  it('EV: instant torque adds 100 ft to the first advance of each race', () => {
    const bonus = TUNABLES.typeIdentity.evFirstAdvanceFt
    expect(bonus).toBe(100)
    expect(advanceFt(versusCivic({ cars: [{ id: PLAID, fuel: 5 }] }))).toBe(base(PLAID) + bonus)
    expect(advanceFt(versusCivic({ cars: [{ id: PLAID, fuel: 5 }] }, { advances: [1, 0] }))).toBe(
      base(PLAID),
    )
  })

  it('Muscle: top end adds 75 ft to advances starting at or past 660 ft', () => {
    const { muscleTopEndFt, muscleTopEndFromFt } = TUNABLES.typeIdentity
    expect([muscleTopEndFt, muscleTopEndFromFt]).toEqual([75, 660])
    const at = versusCivic(
      { cars: [{ id: MUSTANG, fuel: 2 }] },
      { distanceFt: [660, 0], advances: [1, 0] },
    )
    expect(advanceFt(at)).toBe(base(MUSTANG) + muscleTopEndFt)
    const before = versusCivic(
      { cars: [{ id: MUSTANG, fuel: 2 }] },
      { distanceFt: [659, 0], advances: [1, 0] },
    )
    expect(advanceFt(before)).toBe(base(MUSTANG))
  })

  it('JDM: tuner gives 3 Part slots instead of 2', () => {
    expect(partSlots(getCar(CIVIC))).toBe(3)
    expect(partSlots(getCar(MIATA))).toBe(2)
    const twoParts = ['turbo-kit', 'stage-2-tune']
    const jdm = versusCivic({
      cars: [{ id: CIVIC, fuel: 1, parts: twoParts }],
      hand: ['aero-package'],
    })
    expect(
      openSlots(
        stagedCar(jdm, 0) ?? { carId: CIVIC, fuel: 0, wear: 0, parts: [], tractionShield: false },
      ),
    ).toBe(1)
    expect(legalActions(jdm, 0).filter((a) => a.type === 'playPart')).toHaveLength(1)
    const full = versusCivic({
      cars: [{ id: CIVIC, fuel: 1, parts: [...twoParts, 'aero-package'] }],
      hand: ['drag-slicks'],
    })
    expect(legalActions(full, 0).filter((a) => a.type === 'playPart')).toHaveLength(0)
    const sports = versusCivic({
      cars: [{ id: MIATA, fuel: 1, parts: twoParts }],
      hand: ['aero-package'],
    })
    expect(legalActions(sports, 0).filter((a) => a.type === 'playPart')).toHaveLength(0)
  })

  it('Sports: precision makes the first coin flip each race heads, later flips are random', () => {
    // Nitrous Shot flips: heads is +200 ft. Two Nitrous over two turns.
    let state = versusCivic({
      cars: [{ id: MIATA, fuel: 3 }],
      hand: ['nitrous-shot', 'nitrous-shot'],
    })
    const rngBefore = state.rng
    state = apply(state, { type: 'playBoost', player: 0, modId: 'nitrous-shot' })
    const flip = state.log.find((e) => e.kind === 'coinFlip')
    expect(flip).toMatchObject({ purpose: 'mod', heads: true, forcedBySports: true })
    expect(state.rng).toBe(rngBefore)
    expect(state.race.coinFlips[0]).toBe(1)

    // A later flip in the same race uses the generator.
    state = endModsAndAdvance(state, 0)
    state = endModsAndAdvance(apply(state, { type: 'fuel', player: 1, carId: CIVIC }), 1)
    state = apply(state, { type: 'fuel', player: 0, carId: MIATA })
    state = apply(state, { type: 'playBoost', player: 0, modId: 'nitrous-shot' })
    const second = state.log.filter((e) => e.kind === 'coinFlip').at(-1)
    expect(second).toMatchObject({ purpose: 'mod', forcedBySports: false })
    expect(state.rng).not.toBe(rngBefore)
  })

  it('Sports: the forced flip resets with each new race', () => {
    const state = scenario({
      players: [
        { cars: [{ id: PLAID, fuel: 5 }, { id: MIATA }] },
        { cars: [{ id: CIVIC, fuel: 1 }, { id: MUSTANG }] },
      ],
      distanceFt: [700, 0],
      advances: [1, 0],
    })
    let next = endModsAndAdvance(state, 0)
    expect(next.race.number).toBe(2)
    expect(next.race.coinFlips).toEqual([0, 0])
    next = stageBoth(next)
    expect(next.race.coinFlips).toEqual([0, 0])
  })

  it('Luxury: built to last halves the wear penalty', () => {
    const rate = TUNABLES.wearRate * TUNABLES.typeIdentity.luxuryWearMultiplier
    const luxury = versusCivic({ cars: [{ id: LC500, fuel: 2, wear: 2 }] })
    expect(advanceFt(luxury)).toBe(Math.floor(base(LC500) * (1 - 2 * rate)))
    const plain = versusCivic({ cars: [{ id: MUSTANG, fuel: 2, wear: 2 }] })
    expect(advanceFt(plain)).toBe(Math.floor(base(MUSTANG) * (1 - 2 * TUNABLES.wearRate)))
  })

  it('Off-road: traction makes the car immune to Traction sabotage', () => {
    const state = versusCivic({
      cars: [{ id: WRX, fuel: 2 }],
      pending: { flatReductionFt: 100, halve: true, skipAdvance: true },
    })
    expect(advanceFt(state)).toBe(base(WRX))
    const next = endModsAndAdvance(state, 0)
    expect(next.log.some((e) => e.kind === 'advanceSkipped')).toBe(false)
    expect(next.log.some((e) => e.kind === 'tractionIgnored' && e.reason === 'immune')).toBe(true)
  })
})
