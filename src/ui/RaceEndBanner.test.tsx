// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { LOANER_CAR_IDS } from '../collection/stakes.ts'
import { CARS } from '../data/cars.ts'
import { captureFate, RaceEndBanner, type CaptureFate } from './RaceEndBanner.tsx'
import { draw } from './testRender.tsx'

/**
 * What the race-end banner says about the car just taken (backlog U38). It said the car "changes
 * hands" in every match, which read as losing it for good in a match played for nothing, where it
 * only sits out the rest of the match.
 */

const LOANER = [...LOANER_CAR_IDS][0] ?? ''
const OWNED = CARS.find((car) => !LOANER_CAR_IDS.has(car.id))?.id ?? ''

function line(fate: CaptureFate): string {
  const { container } = draw(
    <RaceEndBanner
      raceEnd={{
        race: 1,
        winner: 0,
        loser: 1,
        winningCarId: LOANER,
        capturedCarId: OWNED,
        distanceFt: [1320, 900],
        slips: 1,
        matchOver: false,
      }}
      headline="You win"
      fate={fate}
      onContinue={vi.fn()}
    />,
  )
  return container.querySelector('.raceend__line')?.textContent ?? ''
}

describe('what a pink slip means for the car taken', () => {
  it('is only this match when nothing is staked', () => {
    expect(captureFate(OWNED, false, false)).toBe('match')
    expect(captureFate(LOANER, false, true)).toBe('match')
  })

  it('is for real under stakes, unless the car is a loaner or a keepsake', () => {
    expect(captureFate(OWNED, true, false)).toBe('moves')
    expect(captureFate(LOANER, true, false)).toBe('loaner')
    expect(captureFate(OWNED, true, true)).toBe('keepsake')
  })
})

describe('the race-end banner', () => {
  it('never says a car changes hands in a match played for nothing', () => {
    const text = line('match')
    expect(text).toMatch(/is out for the rest of this match\.$/)
    expect(text).not.toMatch(/changes hands/)
  })

  it('says so when stakes will move the car', () => {
    expect(line('moves')).toMatch(/changes hands for real when the match ends\.$/)
  })

  it('says a loaner car or a keepsake stays put under stakes', () => {
    expect(line('loaner')).toMatch(/loaner car, so stakes never move it\.$/)
    expect(line('keepsake')).toMatch(/keepsake, so stakes never move it\.$/)
  })
})
