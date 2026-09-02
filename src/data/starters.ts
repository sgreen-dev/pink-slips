import type { StarterGarage } from './types.ts'

/**
 * The three starter garages from DESIGN.md 5. The car lists are fixed by the design doc. The
 * decks were finalized in phase 7 against the tuned numbers: with the CPU on both sides the
 * three garages win about half their matches overall, and each beats the next in a cycle.
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
    name: 'Exotic Garage',
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
    name: 'Electric Avenue',
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
