import { describe, expect, it } from 'vitest'
import {
  apply,
  createMatch,
  currentPlayer,
  TUNABLES,
  type Action,
  type MatchState,
} from '../engine/index.ts'
import { scenario, starterConfig } from '../engine/test-helpers.ts'
import {
  advanceSuffix,
  blockedReason,
  handNote,
  laneNotes,
  whyNotPlayable,
  stallWarning,
  whyNotTarget,
} from './explain.ts'

const CIVIC = 'honda-civic-si' // JDM
const MUSTANG = 'ford-mustang-gt' // Muscle
const MIATA = 'mazda-mx-5-miata' // Sports

function board(hand: string[], options: { staged?: string; fuel?: number } = {}) {
  return scenario({
    players: [
      {
        cars: [
          { id: MUSTANG, fuel: options.fuel ?? 2 },
          { id: CIVIC, fuel: options.fuel ?? 1 },
        ],
        staged: options.staged ?? MUSTANG,
        hand,
      },
      { cars: [{ id: MIATA, fuel: 1 }] },
    ],
  })
}

function withTurn(state: MatchState, turn: Partial<MatchState['turn']>): MatchState {
  return { ...state, turn: { ...state.turn, ...turn } }
}

const BREAKDOWN = {
  effectiveHp: 460,
  effectiveWeightLb: 3700,
  baseFt: 500,
  typeBonusFt: 0,
  modBonusFt: 0,
  beforeSabotageFt: 500,
  afterSabotageFt: 500,
  wearMultiplier: 1,
  finalFt: 500,
}

describe('why a card cannot be played', () => {
  it('says nothing for a playable card or outside the mod step', () => {
    expect(blockedReason(board(['power-shift']), 0, 'power-shift')).toBeNull()
    const fuelStep = withTurn(board(['power-shift']), { step: 'fuel' })
    expect(blockedReason(fuelStep, 0, 'power-shift')).toBeNull()
    expect(blockedReason(board(['power-shift']), 1, 'power-shift')).toBeNull()
  })

  it('names the turn limits', () => {
    const boosted = apply(board(['power-shift', 'perfect-launch']), {
      type: 'playBoost',
      player: 0,
      modId: 'power-shift',
    })
    expect(blockedReason(boosted, 0, 'perfect-launch')).toBe('One Boost per turn, already played.')
    const sabotaged = apply(board(['wheelspin', 'bad-tune']), {
      type: 'playSabotage',
      player: 0,
      modId: 'wheelspin',
    })
    expect(blockedReason(sabotaged, 0, 'bad-tune')).toBe('One Sabotage per turn, already played.')
    const blocked = withTurn(board(['power-shift']), { boostBlocked: true })
    expect(blockedReason(blocked, 0, 'power-shift')).toBe('Roadblock: no Boost this turn.')
  })

  it('names the card requirements', () => {
    expect(blockedReason(board(['two-step'], { staged: CIVIC }), 0, 'two-step')).toBe(
      'MUSCLE only. Your staged car is JDM.',
    )
    expect(blockedReason(board(['fuel-dump'], { fuel: 0 }), 0, 'fuel-dump')).toBe(
      'Needs 1 fuel on your staged car.',
    )
    expect(blockedReason(board(['tow-truck'], { fuel: 0 }), 0, 'tow-truck')).toBe(
      'No car with fuel to move.',
    )
    const single = scenario({
      players: [{ cars: [{ id: MUSTANG, fuel: 2 }], hand: ['tow-truck'] }, { cars: [MIATA] }],
    })
    expect(blockedReason(single, 0, 'tow-truck')).toBe('Needs two cars.')
    const full = scenario({
      players: [
        {
          cars: [
            { id: MUSTANG, parts: ['turbo-kit', 'turbo-kit'] },
            { id: CIVIC, parts: ['turbo-kit', 'turbo-kit', 'turbo-kit'] },
          ],
          hand: ['supercharger'],
        },
        { cars: [MIATA] },
      ],
    })
    expect(blockedReason(full, 0, 'supercharger')).toBe(
      'No open Part slot. Cars hold 2 Parts, JDM 3.',
    )
  })
})

describe('hand note', () => {
  it('points at the mod step when cards cannot be played yet', () => {
    expect(handNote(withTurn(board([]), { step: 'fuel' }), 0)).toMatch(/after fuel/)
    expect(handNote(board([]), 0)).toBeNull()
    expect(handNote(withTurn(board([]), { step: 'advance' }), 0)).toMatch(/over this turn/)
    expect(handNote(withTurn(board([]), { step: 'fuel' }), 1)).toBeNull()
    const fresh = createMatch(starterConfig(), 1)
    const first = currentPlayer(fresh)
    if (first === null) throw new Error('No one to stage')
    expect(handNote(fresh, first)).toMatch(/after staging/)
  })
})

describe('lane notes', () => {
  it('spells out pending sabotage and Roadblock', () => {
    const cut = scenario({
      players: [
        { cars: [MUSTANG], pending: { flatReductionFt: 100, halve: true } },
        { cars: [MIATA], pending: { skipAdvance: true }, boostBlockedNextTurn: true },
      ],
    })
    expect(laneNotes(cut, 0)).toEqual([{ text: 'Next advance −100 ft, halved', tone: 'sabotage' }])
    expect(laneNotes(cut, 1)).toEqual([
      { text: 'Skips its next advance', tone: 'sabotage' },
      { text: 'No Boost next turn', tone: 'sabotage' },
    ])
    expect(laneNotes(withTurn(cut, { boostBlocked: true }), 0)).toEqual([
      { text: 'Next advance −100 ft, halved', tone: 'sabotage' },
      { text: 'No Boost this turn', tone: 'sabotage' },
    ])
    expect(laneNotes(board([]), 0)).toEqual([])
  })

  it('names the Boosts played this turn with what they do', () => {
    const shift = apply(board(['power-shift']), {
      type: 'playBoost',
      player: 0,
      modId: 'power-shift',
    })
    expect(laneNotes(shift, 0)).toEqual([{ text: 'Power Shift +100 ft', tone: 'boost' }])
    expect(laneNotes(shift, 1)).toEqual([])
    const nitrous = apply(board(['nitrous-shot']), {
      type: 'playBoost',
      player: 0,
      modId: 'nitrous-shot',
    })
    expect(laneNotes(nitrous, 0)[0]?.text).toMatch(/^Nitrous Shot (heads: \+200|tails: \+50) ft$/)
    const redline = apply(board(['redline']), { type: 'playBoost', player: 0, modId: 'redline' })
    expect(laneNotes(redline, 0)[0]?.text).toBe('Redline +50%, +1 wear after')
    const late = scenario({
      players: [{ cars: [{ id: MUSTANG, fuel: 2 }], hand: ['perfect-launch'] }, { cars: [MIATA] }],
      advances: [1, 0],
      distanceFt: [400, 0],
    })
    const launched = apply(late, { type: 'playBoost', player: 0, modId: 'perfect-launch' })
    expect(laneNotes(launched, 0)[0]?.text).toBe('Perfect Launch no effect, not a first advance')
    const drawn = apply(board(['pit-crew']), { type: 'playBoost', player: 0, modId: 'pit-crew' })
    expect(laneNotes(drawn, 0)).toEqual([])
  })

  it('drops the Boost notes once the turn passes', () => {
    let state = apply(board(['power-shift']), {
      type: 'playBoost',
      player: 0,
      modId: 'power-shift',
    })
    state = apply(state, { type: 'endMods', player: 0 })
    expect(laneNotes(state, 0)).toEqual([{ text: 'Power Shift +100 ft', tone: 'boost' }])
    state = apply(state, { type: 'advance', player: 0 })
    expect(laneNotes(state, 0)).toEqual([])
  })
})

describe('advance suffix', () => {
  it('is empty for a plain advance', () => {
    expect(advanceSuffix(BREAKDOWN)).toBe('')
  })

  it('lists only the steps that changed the distance', () => {
    expect(
      advanceSuffix({
        ...BREAKDOWN,
        modBonusFt: 100,
        beforeSabotageFt: 600,
        afterSabotageFt: 600,
        finalFt: 600,
      }),
    ).toBe('base 500 ft, +100 ft mods')
    expect(
      advanceSuffix({
        ...BREAKDOWN,
        typeBonusFt: 50,
        modBonusFt: 100,
        beforeSabotageFt: 975,
        afterSabotageFt: 875,
        wearMultiplier: 0.9,
        finalFt: 787,
      }),
    ).toBe('base 500 ft, +50 ft type, +100 ft mods, +50% boost, −100 ft sabotage, ×0.9 wear')
  })
})

describe('why a tap was refused', () => {
  const NAMES = ['Player 1', 'Player 2'] as const
  const none = { kind: 'none' } as const
  const messages: string[] = []
  const say = (text: string | null) => {
    if (text) messages.push(text)
    return text
  }

  it('explains a card that cannot be played, naming the card', () => {
    const hand = board(['turbo-kit', 'nitrous-shot', 'sponsor'])
    const part = { kind: 'mod', modId: 'turbo-kit' } as const
    expect(say(whyNotPlayable(hand, 0, 'nitrous-shot', part, null, NAMES))).toBe(
      'Turbo Kit is waiting for a car. Choose one with the pink outline, or Cancel.',
    )
    const options: Action[] = [
      { type: 'playBoost', player: 0, modId: 'sponsor', targetModId: 'turbo-kit' },
    ]
    expect(say(whyNotPlayable(hand, 0, 'nitrous-shot', none, options, NAMES))).toBe(
      'Sponsor is waiting for your pick. Choose a Part above, or Cancel.',
    )
    const theirs = withTurn(hand, { player: 1 })
    expect(say(whyNotPlayable(theirs, 0, 'nitrous-shot', none, null, NAMES))).toBe(
      'Nitrous Shot cannot be played now. Waiting for Player 2; cards play in your own mod step.',
    )
    const staging: MatchState = { ...hand, phase: { kind: 'staging', pending: [0, 1] } }
    expect(say(whyNotPlayable(staging, 0, 'nitrous-shot', none, null, NAMES))).toContain(
      'after staging and fuel',
    )
    expect(
      say(whyNotPlayable(withTurn(hand, { step: 'fuel' }), 0, 'nitrous-shot', none, null, NAMES)),
    ).toContain('after fuel')
    expect(
      say(
        whyNotPlayable(withTurn(hand, { step: 'advance' }), 0, 'nitrous-shot', none, null, NAMES),
      ),
    ).toContain('The mod step is over this turn')
    const thief = scenario({
      players: [
        { cars: [{ id: CIVIC, fuel: 1 }], hand: ['parts-thief'] },
        { cars: [{ id: MIATA, fuel: 1, parts: ['turbo-kit', 'aero-package'] }], hand: ['redline'] },
      ],
    })
    const paused = apply(thief, { type: 'playSabotage', player: 0, modId: 'parts-thief' })
    expect(say(whyNotPlayable(paused, 1, 'redline', none, null, NAMES))).toBe(
      'Redline cannot be played now. Parts Thief first: choose a Part to give up.',
    )
    expect(say(whyNotPlayable(paused, 0, 'parts-thief', none, null, NAMES))).toContain(
      'Waiting for Player 2',
    )
    expect(
      say(
        whyNotPlayable(
          withTurn(hand, { boostBlocked: true }),
          0,
          'nitrous-shot',
          none,
          null,
          NAMES,
        ),
      ),
    ).toBe('Nitrous Shot cannot be played now. Roadblock: no Boost this turn.')
    const sabotaged = apply(board(['wheelspin', 'oil-slick']), {
      type: 'playSabotage',
      player: 0,
      modId: 'wheelspin',
    })
    expect(say(whyNotPlayable(sabotaged, 0, 'oil-slick', none, null, NAMES))).toBe(
      'Oil Slick cannot be played now. One Sabotage per turn, already played.',
    )
    const over: MatchState = { ...hand, phase: { kind: 'over', winner: 1 } }
    expect(say(whyNotPlayable(over, 0, 'nitrous-shot', none, null, NAMES))).toContain(
      'The match is over',
    )
  })

  it('explains a car that is not a target for the picked card', () => {
    const part = { kind: 'mod', modId: 'turbo-kit' } as const
    expect(say(whyNotTarget(0, part, MIATA, 1))).toBe('Turbo Kit goes on your own cars.')
    expect(say(whyNotTarget(0, part, MUSTANG, 0))).toBe(
      `The Ford Mustang GT has no open Part slot. Cars hold ${TUNABLES.partSlots} Parts, JDM ${TUNABLES.partSlotsJdm}.`,
    )
    const tow = { kind: 'mod', modId: 'tow-truck' } as const
    expect(say(whyNotTarget(0, tow, MIATA, 1))).toBe('Tow Truck moves fuel between your own cars.')
    expect(say(whyNotTarget(0, tow, CIVIC, 0))).toBe('The Honda Civic Si has no fuel to move.')
    const towFrom = { kind: 'towFrom', modId: 'tow-truck', fromCarId: MUSTANG } as const
    expect(say(whyNotTarget(0, towFrom, MUSTANG, 0))).toBe(
      'Choose a different car to receive the fuel.',
    )
    expect(say(whyNotTarget(0, towFrom, MIATA, 1))).toBe(
      'Tow Truck moves fuel between your own cars.',
    )
    expect(whyNotTarget(0, none, MUSTANG, 0)).toBeNull()
  })

  it('reads easily from about age nine up', () => {
    expect(messages.length).toBeGreaterThan(12)
    for (const message of messages) {
      expect(message.length, message).toBeLessThanOrEqual(240)
      const sentences = message
        .split(/[.!?:]\s+/)
        .map((s) => s.trim())
        .filter(Boolean)
      for (const sentence of sentences) {
        expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(20)
      }
    }
  })
})

/**
 * A Boost with a fuel cost can take the last fuel the staged car needed, and the turn then ends
 * with no advance at all. DESIGN.md 6 tells the CPU never to do it; the player was told nothing
 * until the turn was already gone.
 */
describe('warning before a Boost strands the car', () => {
  const MIATA = 'mazda-mx-5-miata'

  it('warns when spending the fuel would drop the car below what it needs', () => {
    // Fuel Dump costs 1. At exactly the car's cost, spending it means no advance.
    const state = scenario({
      players: [
        { cars: [{ id: MIATA, fuel: 1 }], hand: ['fuel-dump'] },
        { cars: ['porsche-911-carrera-s'] },
      ],
    })
    const warning = stallWarning(state, 0, 'fuel-dump')
    expect(warning).toContain('would drop below')
  })

  it('says nothing when there is fuel to spare', () => {
    const state = scenario({
      players: [
        { cars: [{ id: MIATA, fuel: 4 }], hand: ['fuel-dump'] },
        { cars: ['porsche-911-carrera-s'] },
      ],
    })
    expect(stallWarning(state, 0, 'fuel-dump')).toBeNull()
  })

  it('says nothing about a Boost that costs no fuel, or about a Part', () => {
    const state = scenario({
      players: [
        { cars: [{ id: MIATA, fuel: 1 }], hand: ['power-shift', 'turbo-kit'] },
        { cars: ['porsche-911-carrera-s'] },
      ],
    })
    expect(stallWarning(state, 0, 'power-shift')).toBeNull()
    expect(stallWarning(state, 0, 'turbo-kit')).toBeNull()
  })
})
