import { describe, expect, it } from 'vitest'
import { TUNABLES } from '../engine/index.ts'
import { rulesSections, rulesText, rulesWordCount } from './rules.ts'

describe('how to play', () => {
  const sections = rulesSections()
  const text = rulesText(sections)

  it('reads its numbers from the tunables', () => {
    const fuel = TUNABLES.fuelCostByTier
    expect(text).toContain(`Common ${fuel.daily}, Uncommon ${fuel.performance}`)
    expect(text).toContain(`Rare ${fuel.super}, Ultra Rare ${fuel.hyper}`)
    expect(text).toContain(`${TUNABLES.trackLengthFt.toLocaleString()} feet`)
    expect(text).toContain(`room for ${TUNABLES.partSlots} Parts`)
    expect(text).toContain(`JDM cars have room for ${TUNABLES.partSlotsJdm}`)
    expect(text).toContain(`moves ${TUNABLES.typeIdentity.evFirstAdvanceFt} feet extra`)
    expect(text).toContain(`Collect ${TUNABLES.pinkSlipsToWin} pink slips`)
    expect(text).toContain(`garage of ${TUNABLES.garageSize} real cars`)
  })

  it('walks through a match in the order the screen asks for things', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'The goal',
      'Fuel makes cars go',
      'Your turn',
      'Winning a race',
      'The cards',
      'Car types',
      'Fuel each car needs',
    ])
    const turn = sections.find((s) => s.title === 'Your turn')
    expect(turn?.kind).toBe('steps')
    expect(turn?.lines.map((line) => line.split(/[: ]/)[0])).toEqual([
      'Draw',
      'Fuel',
      'Mods',
      'Advance',
    ])
    expect(turn?.note).toContain('very first turn')
  })

  it('explains a term before it leans on it', () => {
    const at = (needle: string) => {
      const index = text.indexOf(needle)
      expect(index, needle).toBeGreaterThanOrEqual(0)
      return index
    }
    expect(at('called staging')).toBeLessThan(at('Fuel number'))
    expect(at('your pink slip:')).toBeLessThan(at('as a pink slip'))
    expect(at('Fuel number')).toBeLessThan(at('enough fuel'))
    expect(at('wear point')).toBeLessThan(at('add wear'))
    expect(at('flip a coin')).toBeLessThan(at('coin flip'))
    expect(at('Traction cards shorten')).toBeLessThan(at('Traction cards do not work'))
  })

  it('reads easily from about age nine up', () => {
    const sentences = text
      .split(/[.!?:]\s+|\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    const lengths = sentences.map((s) => s.split(/\s+/).length)
    for (const [i, length] of lengths.entries()) {
      expect(length, sentences[i]).toBeLessThanOrEqual(20)
    }
    const average = lengths.reduce((sum, n) => sum + n, 0) / lengths.length
    expect(average).toBeLessThanOrEqual(13)
    expect(rulesWordCount(sections)).toBeLessThanOrEqual(500)
    for (const section of sections) {
      for (const line of [section.lead ?? '', ...section.lines, section.note ?? '']) {
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
