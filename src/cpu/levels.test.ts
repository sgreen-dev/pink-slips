import { describe, expect, it } from 'vitest'
import { STARTERS } from '../data/starters.ts'
import { nextUint32, seedRng, type MatchConfig, type RngState } from '../engine/index.ts'
import { scenario, type PlayerSpec, type ScenarioSpec } from '../engine/test-helpers.ts'
import { chooseAction } from './cpu.ts'
import { LEVELS, type Level } from './levels.ts'
import { playCpuMatch } from './play.ts'

const CIVIC = 'honda-civic-si' // JDM, Daily, cost 1, 243 ft
const MIATA = 'mazda-mx-5-miata' // Sports, Daily, cost 1, 232 ft
const MUSTANG = 'ford-mustang-gt' // Muscle, Performance, cost 2, 372 ft
const GTR = 'nissan-gt-r' // JDM, Super, cost 4, 517 ft

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

describe('Rookie', () => {
  it('never plays the win rule where Street does', () => {
    const state = duel(
      { cars: [{ id: CIVIC, fuel: 2 }], hand: ['nitrous-shot', 'power-shift', 'wheelspin'] },
      {},
      { distanceFt: [1050, 0] },
    )
    expect(chooseAction(state, 0, 0, 'street')).toEqual({
      type: 'playBoost',
      player: 0,
      modId: 'power-shift',
    })
    // Rookie has no win rule; the cheap Wheelspin it plays instead clears its doubled threshold.
    const rookie = chooseAction(state, 0, 0, 'rookie')
    expect(rookie.type).not.toBe('playBoost')
  })

  it('never plays the stop rule where Street does', () => {
    const state = duel({ hand: ['bad-tune', 'wheelspin'] }, {}, { distanceFt: [0, 1150] })
    expect(chooseAction(state, 0, 0, 'street')).toEqual({
      type: 'playSabotage',
      player: 0,
      modId: 'wheelspin',
    })
    expect(chooseAction(state, 0, 0, 'rookie')).toEqual({ type: 'endMods', player: 0 })
  })

  it('stages by highest advance alone, even a car that cannot move', () => {
    const state = scenario({
      players: [{ cars: [{ id: CIVIC, fuel: 1 }, { id: GTR }] }, { cars: [MIATA] }],
    })
    const staging = { ...state, phase: { kind: 'staging', pending: [0 as const] } } as typeof state
    expect(chooseAction(staging, 0, 0, 'street')).toEqual({
      type: 'stage',
      player: 0,
      carId: CIVIC,
    })
    expect(chooseAction(staging, 0, 0, 'rookie')).toEqual({ type: 'stage', player: 0, carId: GTR })
  })
})

describe('Pro', () => {
  it('holds Red Light until the opponent is fueled, where Street plays it at once', () => {
    const short = duel({ hand: ['red-light'] }, { cars: [{ id: MIATA, fuel: 0 }] })
    expect(chooseAction(short, 0, 0, 'street')).toEqual({
      type: 'playSabotage',
      player: 0,
      modId: 'red-light',
    })
    expect(chooseAction(short, 0, 0, 'pro')).toEqual({ type: 'endMods', player: 0 })
    const fueled = duel({ hand: ['red-light'] }, { cars: [{ id: MIATA, fuel: 1 }] })
    expect(chooseAction(fueled, 0, 0, 'pro')).toEqual({
      type: 'playSabotage',
      player: 0,
      modId: 'red-light',
    })
  })

  it('reads a coin flip at its expected value', () => {
    // Nitrous: tails +50, heads +200. Street sees 50 less the fuel and holds; Pro sees 125.
    const state = duel(
      { cars: [{ id: CIVIC, fuel: 3 }], hand: ['nitrous-shot'] },
      {},
      { distanceFt: [300, 0] },
    )
    expect(chooseAction(state, 0, 0, 'street')).toEqual({ type: 'endMods', player: 0 })
    expect(chooseAction(state, 0, 0, 'pro')).toEqual({
      type: 'playBoost',
      player: 0,
      modId: 'nitrous-shot',
    })
  })
})

describe('levels against each other', () => {
  function starterPairs(): MatchConfig[] {
    const configs: MatchConfig[] = []
    for (const a of STARTERS) {
      for (const b of STARTERS) {
        configs.push({
          players: [
            { garage: a.cars, deck: a.deck },
            { garage: b.cars, deck: b.deck },
          ],
        })
      }
    }
    return configs
  }

  function winRate(a: Level, b: Level, matches: number): { rate: number; msPerAction: number } {
    const configs = starterPairs()
    let rng: RngState = seedRng(13)
    let wins = 0
    let ms = 0
    let actions = 0
    for (let i = 0; i < matches; i++) {
      let seed: number
      ;[seed, rng] = nextUint32(rng)
      const config = configs[i % configs.length]
      if (!config) throw new Error('No config')
      const aSeat = i % 2 === 0 ? 0 : 1
      const t0 = performance.now()
      const result = playCpuMatch(config, seed, { levels: aSeat === 0 ? [a, b] : [b, a] })
      ms += performance.now() - t0
      actions += result.actions
      if (result.winner === aSeat) wins++
    }
    return { rate: wins / matches, msPerAction: ms / actions }
  }

  it('Pro beats Street at least 60% over 2,000 matches', () => {
    const { rate, msPerAction } = winRate('pro', 'street', 2000)
    expect(rate).toBeGreaterThanOrEqual(0.6)
    expect(msPerAction).toBeLessThan(50)
  }, 120_000)

  it('Street beats Rookie at least 65% over 2,000 matches', () => {
    const { rate, msPerAction } = winRate('street', 'rookie', 2000)
    expect(rate).toBeGreaterThanOrEqual(0.65)
    expect(msPerAction).toBeLessThan(50)
  }, 120_000)

  it('every level always returns a legal action and finishes matches', () => {
    for (const level of LEVELS) {
      const result = playCpuMatch(starterPairs()[0] as MatchConfig, 5, { levels: [level, level] })
      expect(result.winner === 0 || result.winner === 1).toBe(true)
    }
  })
})
