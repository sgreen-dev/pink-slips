import { TIER_LABEL } from '../data/tiers.ts'
import { TIERS } from '../data/types.ts'
import { TUNABLES } from '../engine/index.ts'

/**
 * The in-game "How to play", written as a walkthrough in the order a first match asks for
 * things. Every number comes from the tunables so the text cannot drift from the engine, and
 * the wording matches the prompts on the board.
 */

export interface RulesSection {
  title: string
  /** How the lines render: short paragraphs, a bullet list, or numbered steps. */
  kind: 'prose' | 'bullets' | 'steps'
  lines: string[]
  /** A closing sentence shown under the list. */
  note?: string
}

export function rulesSections(t: typeof TUNABLES = TUNABLES): RulesSection[] {
  const identity = t.typeIdentity
  const track = t.trackLengthFt.toLocaleString()
  return [
    {
      title: 'The idea',
      kind: 'prose',
      lines: [
        `Two garages of ${t.garageSize} real cars. Each player stages one and they drag race a quarter mile, ${track} ft. Win and you take the losing car as a pink slip. ${t.pinkSlipsToWin} pink slips wins the match.`,
        'A cheap car runs early; a strong car needs more fuel turns but crosses the track in fewer advances.',
      ],
    },
    {
      title: 'Getting a car moving',
      kind: 'prose',
      lines: [
        'Every car shows a Fuel number. Each turn you add one fuel token to any of your cars, staged or not.',
        'Once your staged car holds as many tokens as its Fuel number, it advances every turn from then on. Driving never spends fuel. Spare fuel is not wasted: some Boosts spend one.',
      ],
    },
    {
      title: 'Your turn',
      kind: 'steps',
      lines: [
        'Draw a card.',
        'Fuel: add one token to any of your cars.',
        `Mods: play cards from your hand. Any number of Parts, ${t.boostsPerTurn} Boost, ${t.sabotagePerTurn} Sabotage. Then end the mod step.`,
        'Advance: if your staged car is fueled, press Advance. It moves by its horsepower and weight, plus whatever your mods add.',
      ],
      note: 'The line above the buttons always says what to do next. Whoever goes first skips the advance on the very first turn.',
    },
    {
      title: 'Winning a race',
      kind: 'prose',
      lines: [
        `First to ${track} ft wins. The winner takes the losing car as a pink slip. The winning car picks up one wear point, which trims every advance it makes from now on.`,
        'Both players stage again. The winner may keep the same car or swap for free.',
      ],
    },
    {
      title: 'Mod cards',
      kind: 'bullets',
      lines: [
        `Parts bolt on for good and take a slot: ${t.partSlots} per car, ${t.partSlotsJdm} on a JDM car.`,
        'Boosts give your car a one-time push this turn.',
        "Sabotage hits the other player's staged car. Traction sabotage cuts or skips its next advance. Pit sabotage hits its fuel, a part, its wear, or its next Boost.",
        'A few cards flip a coin. Heads is the good result for whoever played the card.',
      ],
    },
    {
      title: 'Car types',
      kind: 'bullets',
      lines: [
        `EV: +${identity.evFirstAdvanceFt} ft on its first advance each race.`,
        `Muscle: +${identity.muscleTopEndFt} ft on advances that start at ${identity.muscleTopEndFromFt} ft or past it.`,
        `JDM: ${t.partSlotsJdm} part slots instead of ${t.partSlots}.`,
        'Sports: its first coin flip each race is heads.',
        'Luxury: wear slows it half as much.',
        'Off-road: ignores Traction sabotage.',
      ],
    },
    {
      title: 'Fuel cost by tier',
      kind: 'prose',
      lines: [
        TIERS.map((tier) => `${TIER_LABEL[tier]} ${t.fuelCostByTier[tier]}`).join(', ') + '.',
      ],
    },
  ]
}

export function rulesWordCount(sections: readonly RulesSection[]): number {
  return sections
    .flatMap((section) => [section.title, ...section.lines, section.note ?? ''])
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length
}
