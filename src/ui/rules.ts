import { TIER_LABEL } from '../data/tiers.ts'
import { TIERS } from '../data/types.ts'
import { TUNABLES } from '../engine/index.ts'

/**
 * The in-game rules, short enough to read in a minute. Every number comes from the tunables so
 * the text cannot drift from the engine.
 */

export interface RulesSection {
  title: string
  lines: string[]
}

export function rulesSections(t: typeof TUNABLES = TUNABLES): RulesSection[] {
  const identity = t.typeIdentity
  return [
    {
      title: 'Goal',
      lines: [
        `Win races to take the other player's cars as pink slips. ${t.pinkSlipsToWin} pink slips wins the match.`,
      ],
    },
    {
      title: 'Setup',
      lines: [
        `${t.garageSize} cars in your garage, ${t.modDeckSize} mods in your deck, ${t.startingHandSize} cards in hand. A coin flip picks who goes first, then each player stages one car.`,
      ],
    },
    {
      title: 'Your turn',
      lines: [
        'Draw a card.',
        'Place one fuel token on any of your cars.',
        `Play mods: any Parts, ${t.boostsPerTurn} Boost, ${t.sabotagePerTurn} Sabotage.`,
        "Advance if your staged car's fuel meets its cost. The first player skips the advance on turn one.",
      ],
    },
    {
      title: 'Advancing',
      lines: [
        `Distance comes from horsepower and weight. The first car to ${t.trackLengthFt.toLocaleString()} ft wins the race. Fuel is never used up by advancing.`,
      ],
    },
    {
      title: 'Cards',
      lines: [
        `Parts attach for good and take a slot, ${t.partSlots} per car and ${t.partSlotsJdm} on a JDM car. Boosts help your car this turn. Sabotage hits the opponent's staged car: Traction lands on their next advance, Pit hits fuel, parts, or wear.`,
      ],
    },
    {
      title: 'After a race',
      lines: [
        'The winner takes the losing car. The winning car gains one wear point, which slows it. Both players stage again; the winner may keep the same car.',
      ],
    },
    {
      title: 'Types',
      lines: [
        `EV: +${identity.evFirstAdvanceFt} ft on the first advance of each race.`,
        `Muscle: +${identity.muscleTopEndFt} ft on advances that start at ${identity.muscleTopEndFromFt} ft or past it.`,
        `JDM: ${t.partSlotsJdm} part slots instead of ${t.partSlots}.`,
        'Sports: the first coin flip each race is heads.',
        'Luxury: wear slows the car half as much.',
        'Off-road: immune to Traction sabotage.',
      ],
    },
    {
      title: 'Fuel cost by tier',
      lines: [
        TIERS.map((tier) => `${TIER_LABEL[tier]} ${t.fuelCostByTier[tier]}`).join(', ') + '.',
      ],
    },
  ]
}

export function rulesWordCount(sections: readonly RulesSection[]): number {
  return sections
    .flatMap((section) => [section.title, ...section.lines])
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
}
