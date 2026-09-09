import type { IntroSet, StarterGarage } from './types.ts'

/**
 * The three loaner garages from DESIGN.md 5: always raceable and never owned, so they can never
 * be broken and a new player is racing at once. The car lists are fixed by the design doc. The
 * decks were finalized in phase 7 against the tuned numbers: with the CPU on both sides the
 * three garages win about half their matches overall, and each beats the next in a cycle.
 * What a fresh collection owns is INTRO_SET at the foot of this file, not these.
 */

/** Expands [modId, copies] pairs into a flat deck list. */
function deck(entries: ReadonlyArray<readonly [string, number]>): readonly string[] {
  return entries.flatMap(([id, copies]) => Array.from({ length: copies }, () => id))
}

export const STARTERS: readonly StarterGarage[] = [
  {
    id: 'street-kings',
    name: 'Street Kings',
    style: 'cheap tempo, race early and often',
    cars: [
      'ford-mustang-gt',
      'chevrolet-camaro-ss-1le',
      'mazda-rx-7',
      'honda-s2000',
      'honda-civic-si',
    ],
    deck: deck([
      ['two-step', 3],
      ['anti-lag', 2],
      ['perfect-launch', 3],
      ['power-shift', 3],
      ['drag-slicks', 2],
      ['stage-2-tune', 3],
      ['turbo-kit', 2],
      ['pit-crew', 3],
      ['wheelspin', 3],
      ['red-light', 2],
      ['bad-tune', 2],
      ['roadblock', 2],
    ]),
  },
  {
    id: 'exotic-garage',
    name: 'Exotics',
    style: 'fuel the bench, win late with big cars',
    cars: [
      'lamborghini-aventador-svj',
      'ferrari-458-italia',
      'mercedes-amg-gt-r',
      'porsche-911-carrera-s',
      'mazda-mx-5-miata',
    ],
    deck: deck([
      ['extra-tank', 3],
      ['tow-truck', 3],
      ['fuel-cell', 3],
      ['sponsor', 2],
      ['supercharger', 3],
      ['carbon-body-kit', 2],
      ['roll-cage', 2],
      ['nitrous-shot', 3],
      ['fuel-dump', 2],
      ['fuel-siphon', 3],
      ['missed-shift', 2],
      ['parts-thief', 2],
    ]),
  },
  {
    id: 'electric-avenue',
    name: 'EVs',
    style: 'launch bonuses and traction immunity',
    cars: [
      'tesla-model-s-plaid',
      'hyundai-ioniq-5-n',
      'ford-f-150-raptor-r',
      'subaru-wrx-sti',
      'toyota-prius',
    ],
    deck: deck([
      ['regen', 3],
      ['drag-slicks', 2],
      ['perfect-launch', 2],
      ['launch-control', 2],
      ['wheelie-bar', 2],
      ['weight-reduction', 2],
      ['extra-tank', 2],
      ['aero-package', 2],
      ['overdrive', 2],
      ['oil-slick', 2],
      ['red-light', 1],
      ['bad-tune', 2],
      ['pit-crew', 3],
      ['sponsor', 3],
    ]),
  },
]

export const STARTER_BY_ID: ReadonlyMap<string, StarterGarage> = new Map(
  STARTERS.map((starter) => [starter.id, starter]),
)

/**
 * The intro set (DESIGN.md 12): what a fresh collection owns. Six cars kept from the loaner
 * garages, none above Performance, so every Super and Hyper is opened rather than given. The
 * cars were picked by measurement, not by looks: a first pass on slower ones left the set at
 * 25% against the field where the loaners run 43 to 50, and these bring it to 46. The mods are
 * the consistent half of the pool at two copies each, one below the deck cap, so no pack slot
 * is dead on the first pack. Concentrating them into a three-copy spine was tried and dropped:
 * it bought about three points and cost six live pack slots. The type-locked mods are held
 * back deliberately, and every one of them has a car here to land on.
 */
export const INTRO_SET: IntroSet = {
  cars: [
    'ford-f-150-raptor-r',
    'hyundai-ioniq-5-n',
    'ford-mustang-gt',
    'mazda-rx-7',
    'honda-civic-si',
    'mazda-mx-5-miata',
  ],
  mods: [
    ['turbo-kit', 2],
    ['stage-2-tune', 2],
    ['weight-reduction', 2],
    ['drag-slicks', 2],
    ['fuel-cell', 2],
    ['power-shift', 2],
    ['perfect-launch', 2],
    ['nitrous-shot', 2],
    ['pit-crew', 2],
    ['sponsor', 2],
    ['extra-tank', 2],
    ['launch-control', 2],
    ['wheelspin', 2],
    ['missed-shift', 2],
    ['fuel-siphon', 2],
    ['bad-tune', 2],
  ],
}
