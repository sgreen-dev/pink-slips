import { TIER_LABEL } from '../data/tiers.ts'
import { CAR_TYPE_LABEL, TIERS, type CarType } from '../data/types.ts'
import { TUNABLES } from '../engine/index.ts'

/**
 * The in-game "How to play", written as a walkthrough in the order a first match asks for
 * things, for readers from about age nine up: short sentences, everyday words, every term
 * explained before it is used. Every number comes from the tunables so the text cannot drift
 * from the engine, and the wording matches the prompts on the board.
 */

export interface RulesSection {
  title: string
  /** How the lines render: short paragraphs, a bullet list, or numbered steps. */
  kind: 'prose' | 'bullets' | 'steps'
  /** A sentence shown above the list. */
  lead?: string
  lines: string[]
  /** A closing sentence shown under the list. */
  note?: string
}

/** Each type's identity in one sentence, shared by the rules and the card detail panel. */
export function typeIdentityLines(
  t: typeof TUNABLES = TUNABLES,
): Readonly<Record<CarType, string>> {
  const identity = t.typeIdentity
  return {
    ev: `moves ${identity.evFirstAdvanceFt} feet extra on its first move of each race.`,
    muscle: `moves ${identity.muscleTopEndFt} feet extra on any move that starts at ${identity.muscleTopEndFromFt} feet or farther.`,
    jdm: `room for ${t.partSlotsJdm} Parts instead of ${t.partSlots}.`,
    sports: 'its first coin flip each race is always heads.',
    luxury: 'wear slows it down only half as much.',
    offroad: 'Traction cards do not work on it.',
  }
}

const TYPE_ORDER: readonly CarType[] = ['ev', 'muscle', 'jdm', 'sports', 'luxury', 'offroad']

export function rulesSections(t: typeof TUNABLES = TUNABLES): RulesSection[] {
  const identityLines = typeIdentityLines(t)
  const track = t.trackLengthFt.toLocaleString()
  const fuelByTier = TIERS.map((tier) => `${TIER_LABEL[tier]} ${t.fuelCostByTier[tier]}`).join(', ')
  return [
    {
      title: 'The goal',
      kind: 'prose',
      lines: [
        `Each player has a garage of ${t.garageSize} real cars. To start a race, each player puts one car on the track. This is called staging.`,
        `The two cars race down a straight track ${track} feet long. If your car gets to the end first, you win the race and take the other car. It becomes your pink slip: a paper that says the car is now yours.`,
        `Collect ${t.pinkSlipsToWin} pink slips and you win the match.`,
        'Slow cars need less fuel, so they start moving sooner. Fast cars need more fuel, but they finish the track in fewer moves.',
      ],
    },
    {
      title: 'Fuel makes cars go',
      kind: 'prose',
      lines: [
        'Every car card shows a Fuel number. On each of your turns, you put one fuel token on any of your cars.',
        'When the car on the track has as many tokens as its Fuel number, it can move. From then on it moves every turn. Moving does not use up fuel.',
        'Extra fuel is fine. Some Boost cards use one token.',
      ],
    },
    {
      title: 'Your turn',
      kind: 'steps',
      lines: [
        'Draw a card.',
        'Fuel: put one fuel token on any of your cars.',
        `Mods: play cards from your hand. Play as many Parts as you like, but only ${t.boostsPerTurn} Boost and ${t.sabotagePerTurn} Sabotage. Then press End mod step.`,
        'Advance: if your car has enough fuel, press Advance to move it. A car with more power and less weight moves farther.',
      ],
      note: 'Not sure what to do? The line above the buttons always tells you. The player who goes first does not move on the very first turn.',
    },
    {
      title: 'Winning a race',
      kind: 'prose',
      lines: [
        `The first car to reach ${track} feet wins the race. The winner takes the losing car as a pink slip.`,
        'The winning car gets 1 wear point. A car with wear moves a little less far each turn.',
        'Then both players pick a car for the next race. The winner can keep the same car or switch to another one.',
      ],
    },
    {
      title: 'The cards',
      kind: 'bullets',
      lead: 'Mod cards, or mods, change how the cars race. There are three kinds:',
      lines: [
        `Parts stay on a car for the whole match. Each car has room for ${t.partSlots} Parts. JDM cars have room for ${t.partSlotsJdm}.`,
        'Boosts help your car for one turn only.',
        "Sabotage cards hurt the other player's car. Traction cards shorten or stop its next move. Pit cards take fuel or a Part, add wear, or block its next Boost.",
      ],
      note: 'Some cards flip a coin. Heads is the good result for the player who played the card.',
    },
    {
      title: 'Car types',
      kind: 'bullets',
      lines: TYPE_ORDER.map((type) => `${CAR_TYPE_LABEL[type]}: ${identityLines[type]}`),
    },
    {
      title: 'Fuel each car needs',
      kind: 'prose',
      lines: [`${fuelByTier}. Rarer cars are faster and need more fuel.`],
    },
  ]
}

export function rulesText(sections: readonly RulesSection[]): string {
  return sections
    .flatMap((section) => [section.title, section.lead ?? '', ...section.lines, section.note ?? ''])
    .filter(Boolean)
    .join('\n')
}

export function rulesWordCount(sections: readonly RulesSection[]): number {
  return rulesText(sections).split(/\s+/).filter(Boolean).length
}
