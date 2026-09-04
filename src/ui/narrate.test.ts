import { describe, expect, it } from 'vitest'
import { createMatch } from '../engine/index.ts'
import { playOut, starterConfig } from '../engine/test-helpers.ts'
import { describeLogEntry } from './narrate.ts'

const NAMES = ['Player 1', 'Player 2'] as const

describe('match log narration', () => {
  it('describes the entries a player needs to follow the match', () => {
    expect(
      describeLogEntry(
        { kind: 'coinFlip', purpose: 'firstPlayer', heads: true, firstPlayer: 1 },
        NAMES,
      ),
    ).toBe('Coin flip: heads. Player 2 goes first.')
    expect(describeLogEntry({ kind: 'stage', player: 0, carId: 'honda-civic-si' }, NAMES)).toBe(
      'Player 1 stages the Honda Civic Si.',
    )
    expect(
      describeLogEntry(
        { kind: 'playPart', player: 1, modId: 'turbo-kit', carId: 'mazda-mx-5-miata' },
        NAMES,
      ),
    ).toBe('Player 2 fits Turbo Kit to the Mazda MX-5 Miata.')
    expect(
      describeLogEntry(
        { kind: 'raceEnd', race: 2, winner: 0, capturedCarId: 'nissan-gt-r' },
        NAMES,
      ),
    ).toBe('Race 2: Player 1 wins and takes the Nissan GT-R as a pink slip.')
    expect(
      describeLogEntry({ kind: 'advanceSkipped', player: 0, reason: 'redLight' }, NAMES),
    ).toMatch(/Red Light/)
  })

  it('shows what changed an advance', () => {
    const breakdown = {
      effectiveHp: 460,
      effectiveWeightLb: 3700,
      baseFt: 500,
      typeBonusFt: 0,
      modBonusFt: 100,
      beforeSabotageFt: 600,
      afterSabotageFt: 600,
      wearMultiplier: 1,
      finalFt: 600,
    }
    const entry = {
      kind: 'advance',
      player: 0,
      carId: 'ford-mustang-gt',
      fromFt: 0,
      toFt: 600,
      breakdown,
    } as const
    expect(describeLogEntry(entry, NAMES)).toMatch(
      /advances 600 ft to 600 ft \(base 500 ft, \+100 ft mods\)\.$/,
    )
    const plain = {
      ...entry,
      toFt: 500,
      breakdown: {
        ...breakdown,
        modBonusFt: 0,
        beforeSabotageFt: 500,
        afterSabotageFt: 500,
        finalFt: 500,
      },
    }
    expect(describeLogEntry(plain, NAMES)).toMatch(/advances 500 ft to 500 ft\.$/)
  })

  it('hides bookkeeping entries', () => {
    expect(describeLogEntry({ kind: 'turnStart', player: 0, number: 3 }, NAMES)).toBeNull()
    expect(describeLogEntry({ kind: 'draw', player: 0, count: 1 }, NAMES)).toBeNull()
  })

  it('narrates every entry of a full match without throwing', () => {
    const final = playOut(createMatch(starterConfig(), 4))
    const lines = final.log.map((entry) => describeLogEntry(entry, NAMES))
    expect(lines.some((line) => line?.includes('wins the match'))).toBe(true)
    for (const line of lines) {
      if (line !== null) expect(line.length).toBeGreaterThan(0)
    }
  })
})
