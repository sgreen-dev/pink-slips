import { describe, expect, it } from 'vitest'
import { TUNABLES } from '../engine/index.ts'
import { rulesSections, rulesWordCount } from './rules.ts'

describe('in-game rules', () => {
  const sections = rulesSections()
  const text = sections.flatMap((s) => [s.title, ...s.lines]).join('\n')

  it('reads its numbers from the tunables', () => {
    const fuel = TUNABLES.fuelCostByTier
    expect(text).toContain(`Common ${fuel.daily}, Uncommon ${fuel.performance}`)
    expect(text).toContain(`Rare ${fuel.super}, Ultra Rare ${fuel.hyper}`)
    expect(text).toContain(TUNABLES.trackLengthFt.toLocaleString())
    expect(text).toContain(
      `${TUNABLES.partSlots} per car and ${TUNABLES.partSlotsJdm} on a JDM car`,
    )
    expect(text).toContain(`+${TUNABLES.typeIdentity.evFirstAdvanceFt} ft`)
    expect(text).toContain(`${TUNABLES.pinkSlipsToWin} pink slips wins`)
  })

  it('covers the goal, the turn, the cards, the race end, and the types', () => {
    expect(sections.map((s) => s.title)).toEqual([
      'Goal',
      'Setup',
      'Your turn',
      'Advancing',
      'Cards',
      'After a race',
      'Types',
      'Fuel cost by tier',
    ])
  })

  it('stays short', () => {
    expect(rulesWordCount(sections)).toBeLessThanOrEqual(260)
    for (const section of sections) {
      for (const line of section.lines) expect(line.length, line).toBeLessThanOrEqual(240)
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
