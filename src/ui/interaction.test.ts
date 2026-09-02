import { describe, expect, it } from 'vitest'
import { apply } from '../engine/index.ts'
import { scenario } from '../engine/test-helpers.ts'
import { buttonActions, carIntents, modIntent, NO_SELECTION, prompt } from './interaction.ts'

const CIVIC = 'honda-civic-si'
const MUSTANG = 'ford-mustang-gt'
const MIATA = 'mazda-mx-5-miata'
const NAMES = ['Player 1', 'Player 2'] as const

function board(hand: string[], step: 'fuel' | 'mods' = 'mods', deck: string[] = []) {
  return scenario({
    players: [
      {
        cars: [
          { id: CIVIC, fuel: 1 },
          { id: MUSTANG, fuel: 2 },
        ],
        hand,
        deck,
      },
      { cars: [{ id: MIATA, fuel: 1 }] },
    ],
    step,
  })
}

describe('board interaction', () => {
  it('fuel step: every own car takes a fuel token', () => {
    const state = board([], 'fuel')
    const intents = carIntents(state, 0, NO_SELECTION)
    expect([...intents.keys()]).toEqual([CIVIC, MUSTANG])
    expect(intents.get(CIVIC)).toEqual({
      kind: 'apply',
      action: { type: 'fuel', player: 0, carId: CIVIC },
    })
    expect(carIntents(state, 1, NO_SELECTION).size).toBe(0)
    expect(prompt(state, 0, NO_SELECTION, NAMES)).toMatch(/fuel token/)
    expect(prompt(state, 1, NO_SELECTION, NAMES)).toMatch(/Waiting for Player 1/)
  })

  it('a Part waits for a car, then attaches', () => {
    const state = board(['turbo-kit'])
    const intent = modIntent(state, 0, 'turbo-kit')
    expect(intent).toEqual({ kind: 'select', selection: { kind: 'mod', modId: 'turbo-kit' } })
    if (intent.kind !== 'select') return
    const targets = carIntents(state, 0, intent.selection)
    expect([...targets.keys()]).toEqual([CIVIC, MUSTANG])
    expect(targets.get(MUSTANG)).toEqual({
      kind: 'apply',
      action: { type: 'playPart', player: 0, modId: 'turbo-kit', carId: MUSTANG },
    })
    expect(prompt(state, 0, intent.selection, NAMES)).toBe('Choose a car for Turbo Kit.')
  })

  it('Tow Truck picks a source then a destination', () => {
    const state = board(['tow-truck'])
    const first = modIntent(state, 0, 'tow-truck')
    expect(first.kind).toBe('select')
    if (first.kind !== 'select') return
    const sources = carIntents(state, 0, first.selection)
    const fromMustang = sources.get(MUSTANG)
    expect(fromMustang).toEqual({
      kind: 'select',
      selection: { kind: 'towFrom', modId: 'tow-truck', fromCarId: MUSTANG },
    })
    if (fromMustang?.kind !== 'select') return
    const destinations = carIntents(state, 0, fromMustang.selection)
    expect([...destinations.keys()]).toEqual([CIVIC])
    expect(destinations.get(CIVIC)).toEqual({
      kind: 'apply',
      action: {
        type: 'playBoost',
        player: 0,
        modId: 'tow-truck',
        fromCarId: MUSTANG,
        toCarId: CIVIC,
      },
    })
    expect(prompt(state, 0, fromMustang.selection, NAMES)).toMatch(/receive 2 fuel/)
  })

  it('Sponsor offers the Parts in the deck as options', () => {
    const state = board(['sponsor'], 'mods', ['wheelspin', 'turbo-kit'])
    const intent = modIntent(state, 0, 'sponsor')
    expect(intent.kind).toBe('options')
    if (intent.kind !== 'options') return
    expect(intent.options).toEqual([
      { type: 'playBoost', player: 0, modId: 'sponsor', targetModId: 'turbo-kit' },
    ])
  })

  it('plain Boosts and Sabotage play at once, and locked cards are unplayable', () => {
    const state = board(['power-shift', 'wheelspin', 'two-step'])
    expect(modIntent(state, 0, 'power-shift')).toEqual({
      kind: 'apply',
      action: { type: 'playBoost', player: 0, modId: 'power-shift' },
    })
    expect(modIntent(state, 0, 'wheelspin')).toEqual({
      kind: 'apply',
      action: { type: 'playSabotage', player: 0, modId: 'wheelspin' },
    })
    expect(modIntent(state, 0, 'two-step')).toEqual({ kind: 'unplayable' })
  })

  it('buttons follow the step: end mods, then advance, and Parts Thief picks', () => {
    let state = board(['parts-thief'])
    expect(buttonActions(state, 0)).toEqual([{ type: 'endMods', player: 0 }])
    state = apply(state, { type: 'endMods', player: 0 })
    expect(buttonActions(state, 0)).toEqual([{ type: 'advance', player: 0 }])
    expect(prompt(state, 0, NO_SELECTION, NAMES)).toMatch(/Advance/)

    const thief = scenario({
      players: [
        { cars: [{ id: CIVIC, fuel: 1 }], hand: ['parts-thief'] },
        { cars: [{ id: MIATA, fuel: 1, parts: ['turbo-kit', 'aero-package'] }] },
      ],
    })
    const paused = apply(thief, { type: 'playSabotage', player: 0, modId: 'parts-thief' })
    expect(buttonActions(paused, 1).map((a) => a.type)).toEqual(['discardPart', 'discardPart'])
    expect(prompt(paused, 1, NO_SELECTION, NAMES)).toMatch(/Parts Thief/)
    expect(prompt(paused, 0, NO_SELECTION, NAMES)).toMatch(/Waiting for Player 2/)
  })
})
