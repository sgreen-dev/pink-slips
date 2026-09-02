import type { BoostMod, Mod, PartMod, SabotageMod } from './types.ts'

/**
 * The starting mod set from DESIGN.md 2.5. All magnitudes are tunable and will be revisited
 * in phase 5 against simulator evidence.
 */

const PARTS: readonly PartMod[] = [
  {
    id: 'turbo-kit',
    name: 'Turbo Kit',
    family: 'part',
    text: '+20% hp.',
    effects: [{ kind: 'hpPercent', value: 0.2 }],
  },
  {
    id: 'supercharger',
    name: 'Supercharger',
    family: 'part',
    text: '+25% hp.',
    effects: [{ kind: 'hpPercent', value: 0.25 }],
  },
  {
    id: 'stage-2-tune',
    name: 'Stage 2 Tune',
    family: 'part',
    text: '+10% hp.',
    effects: [{ kind: 'hpPercent', value: 0.1 }],
  },
  {
    id: 'weight-reduction',
    name: 'Weight Reduction',
    family: 'part',
    text: '−300 lb.',
    effects: [{ kind: 'weightReduction', lb: 300 }],
  },
  {
    id: 'carbon-body-kit',
    name: 'Carbon Body Kit',
    family: 'part',
    text: '−150 lb.',
    effects: [{ kind: 'weightReduction', lb: 150 }],
  },
  {
    id: 'drag-slicks',
    name: 'Drag Slicks',
    family: 'part',
    text: "+100 ft on this car's first advance of each race.",
    effects: [{ kind: 'flatDistance', ft: 100, window: { when: 'firstAdvance' } }],
  },
  {
    id: 'aero-package',
    name: 'Aero Package',
    family: 'part',
    text: '+50 ft on advances that start at or past 660 ft.',
    effects: [{ kind: 'flatDistance', ft: 50, window: { when: 'fromDistance', minStartFt: 660 } }],
  },
  {
    id: 'fuel-cell',
    name: 'Fuel Cell',
    family: 'part',
    text: "This car's fuel cost −1, minimum 1.",
    effects: [{ kind: 'fuelCostDelta', value: -1, minimum: 1 }],
  },
  {
    id: 'roll-cage',
    name: 'Roll Cage',
    family: 'part',
    text: 'This car gains no wear from winning.',
    effects: [{ kind: 'noWearFromWinning' }],
  },
  {
    id: 'wheelie-bar',
    name: 'Wheelie Bar',
    family: 'part',
    text: 'This car is immune to Traction sabotage.',
    effects: [{ kind: 'tractionImmunity' }],
  },
]

const BOOSTS: readonly BoostMod[] = [
  {
    id: 'nitrous-shot',
    name: 'Nitrous Shot',
    family: 'boost',
    fuelCost: 1,
    text: 'Costs 1 fuel. Coin flip: heads +200 ft, tails +50 ft.',
    effects: [
      {
        kind: 'coinFlip',
        heads: [{ kind: 'flatDistance', ft: 200, window: { when: 'always' } }],
        tails: [{ kind: 'flatDistance', ft: 50, window: { when: 'always' } }],
      },
    ],
  },
  {
    id: 'power-shift',
    name: 'Power Shift',
    family: 'boost',
    text: '+100 ft this advance.',
    effects: [{ kind: 'flatDistance', ft: 100, window: { when: 'always' } }],
  },
  {
    id: 'perfect-launch',
    name: 'Perfect Launch',
    family: 'boost',
    text: "+150 ft if this is the car's first advance of the race.",
    effects: [{ kind: 'flatDistance', ft: 150, window: { when: 'firstAdvance' } }],
  },
  {
    id: 'redline',
    name: 'Redline',
    family: 'boost',
    text: '+50% this advance, then this car gains 1 wear.',
    effects: [
      { kind: 'distancePercent', value: 0.5 },
      { kind: 'addWear', target: 'self', count: 1 },
    ],
  },
  {
    id: 'fuel-dump',
    name: 'Fuel Dump',
    family: 'boost',
    fuelCost: 1,
    text: 'Remove 1 fuel from this car: +250 ft this advance.',
    effects: [{ kind: 'flatDistance', ft: 250, window: { when: 'always' } }],
  },
  {
    id: 'overdrive',
    name: 'Overdrive',
    family: 'boost',
    text: 'Coin flip: heads, advance a second time this turn at half distance.',
    effects: [
      {
        kind: 'coinFlip',
        heads: [{ kind: 'extraAdvance', distanceMultiplier: 0.5 }],
        tails: [],
      },
    ],
  },
  {
    id: 'launch-control',
    name: 'Launch Control',
    family: 'boost',
    text: "This car's next advance cannot be reduced by Traction sabotage.",
    effects: [{ kind: 'tractionShield' }],
  },
  {
    id: 'extra-tank',
    name: 'Extra Tank',
    family: 'boost',
    text: 'Place one additional fuel this turn.',
    effects: [{ kind: 'extraFuelPlacement', count: 1 }],
  },
  {
    id: 'tow-truck',
    name: 'Tow Truck',
    family: 'boost',
    text: 'Move all fuel from one of your cars to another of your cars.',
    effects: [{ kind: 'moveAllFuel' }],
  },
  {
    id: 'pit-crew',
    name: 'Pit Crew',
    family: 'boost',
    text: 'Draw 2 cards.',
    effects: [{ kind: 'draw', count: 2 }],
  },
  {
    id: 'sponsor',
    name: 'Sponsor',
    family: 'boost',
    text: 'Search your deck for a Part, put it in your hand, shuffle.',
    effects: [{ kind: 'searchDeck', family: 'part', count: 1 }],
  },
  {
    id: 'two-step',
    name: 'Two-Step',
    family: 'boost',
    typeLock: 'muscle',
    text: "Muscle only. +150 ft on this car's first advance of the race.",
    effects: [{ kind: 'flatDistance', ft: 150, window: { when: 'firstAdvance' } }],
  },
  {
    id: 'anti-lag',
    name: 'Anti-Lag',
    family: 'boost',
    typeLock: 'jdm',
    text: 'JDM only. Every Part on this car gives an additional +5% hp this advance.',
    effects: [{ kind: 'hpPercentPerPart', value: 0.05 }],
  },
  {
    id: 'regen',
    name: 'Regen',
    family: 'boost',
    typeLock: 'ev',
    text: 'EV only. Place one fuel on this car.',
    effects: [{ kind: 'addFuel', target: 'self', count: 1 }],
  },
]

const SABOTAGE: readonly SabotageMod[] = [
  // Traction: the opponent's staged car's next advance
  {
    id: 'wheelspin',
    name: 'Wheelspin',
    family: 'sabotage',
    kind: 'traction',
    text: "Opponent's next advance −100 ft.",
    effects: [{ kind: 'reduceDistance', ft: 100 }],
  },
  {
    id: 'missed-shift',
    name: 'Missed Shift',
    family: 'sabotage',
    kind: 'traction',
    text: "Opponent's next advance halved.",
    effects: [{ kind: 'halveDistance' }],
  },
  {
    id: 'red-light',
    name: 'Red Light',
    family: 'sabotage',
    kind: 'traction',
    text: "If the opponent's staged car has not advanced this race, it skips its next advance.",
    effects: [{ kind: 'skipAdvance', condition: 'notYetAdvancedThisRace' }],
  },
  {
    id: 'oil-slick',
    name: 'Oil Slick',
    family: 'sabotage',
    kind: 'traction',
    text: "Opponent's next advance −50 ft. Coin flip: heads, −50 ft more.",
    effects: [
      { kind: 'reduceDistance', ft: 50 },
      { kind: 'coinFlip', heads: [{ kind: 'reduceDistance', ft: 50 }], tails: [] },
    ],
  },
  // Pit: the opponent's staged car's fuel, parts, or wear
  {
    id: 'fuel-siphon',
    name: 'Fuel Siphon',
    family: 'sabotage',
    kind: 'pit',
    text: "Remove 1 fuel from the opponent's staged car.",
    effects: [{ kind: 'removeFuel', target: 'opponent', count: 1 }],
  },
  {
    id: 'parts-thief',
    name: 'Parts Thief',
    family: 'sabotage',
    kind: 'pit',
    text: "Discard one Part from the opponent's staged car, their choice.",
    effects: [{ kind: 'discardPart', chooser: 'opponent' }],
  },
  {
    id: 'roadblock',
    name: 'Roadblock',
    family: 'sabotage',
    kind: 'pit',
    text: 'Opponent cannot play a Boost on their next turn.',
    effects: [{ kind: 'blockBoost' }],
  },
  {
    id: 'bad-tune',
    name: 'Bad Tune',
    family: 'sabotage',
    kind: 'pit',
    text: "Opponent's staged car gains 1 wear.",
    effects: [{ kind: 'addWear', target: 'opponent', count: 1 }],
  },
]

export const MODS: readonly Mod[] = [...PARTS, ...BOOSTS, ...SABOTAGE]

export const MOD_BY_ID: ReadonlyMap<string, Mod> = new Map(MODS.map((mod) => [mod.id, mod]))

export function getMod(id: string): Mod {
  const mod = MOD_BY_ID.get(id)
  if (!mod) throw new Error(`Unknown mod id: ${id}`)
  return mod
}
