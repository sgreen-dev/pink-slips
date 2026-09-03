import { describe, expect, it } from 'vitest'
import { TUNABLES } from '../engine/index.ts'
import { rulesSections, rulesWordCount } from './rules.ts'

describe('how to play', () => {
  const sections = rulesSections()
  const text = sections.flatMap((s) => [s.title, ...s.lines, s.note ?? '']).join('\n')

  it('reads its numbers from the tunables', () => {
    const fuel = TUNABLES.fuelCostByTier
    expect(text).toContain(`Common ${fuel.daily}, Uncommon ${fuel.performance}`)
    expect(text).toContain(`Rare ${fuel.super}, Ultra Rare ${fuel.hyper}`)
    expect(text).toContain(`${TUNABLES.trackLengthFt.toLocaleString()} ft`)
    expect(text).toContain(`${TUNABLES.partSlots} per car, ${TUNABLES.partSlotsJdm} on a JDM car`)
    expect(text).toContain(`+${TUNABLES.typeIdentity.evFirstAdvanceFt} ft`)
    expect(text).toContain(`${TUNABLES.pinkSlipsToWin} pink slips wins`)
    expect(text).toContain(`${TUNABLES.garageSize} real cars`)
  })

  it('walks through a match in the order the screen asks for things', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'The idea',
      'Getting a car moving',
      'Your turn',
      'Winning a race',
      'Mod cards',
      'Car types',
      'Fuel cost by tier',
    ])
    const turn = sections.find((s) => s.title === 'Your turn')
    expect(turn?.kind).toBe('steps')
    expect(turn?.lines.map((line) => line.split(/[: ]/)[0])).toEqual([
      'Draw',
      'Fuel',
      'Mods',
      'Advance',
    ])
    expect(turn?.note).toContain('skips the advance')
  })

  it('explains a term before it leans on it', () => {
    const at = (needle: string) => {
      const index = text.indexOf(needle)
      expect(index, needle).toBeGreaterThanOrEqual(0)
      return index
    }
    expect(at('Fuel number')).toBeLessThan(at('is fueled'))
    expect(at('one wear point')).toBeLessThan(at('its wear'))
    expect(at('flip a coin')).toBeLessThan(at('first coin flip'))
    expect(at('Traction sabotage cuts')).toBeLessThan(at('ignores Traction sabotage'))
  })

  it('stays short', () => {
    expect(rulesWordCount(sections)).toBeLessThanOrEqual(400)
    for (const section of sections) {
      for (const line of [...section.lines, section.note ?? '']) {
        expect(line.length, line).toBeLessThanOrEqual(240)
      }
    }
  })

  it('tracks a tunable change', () => {
    const changed = rulesSections({
      ...TUNABLES,
      fuelCostByTier: { ...TUNABLES.fuelCostByTier, hyper: 9 },
    })
    expect(changed.at(-1)?.lines[0]).toContain('Ultra Rare 9')
  })
})
