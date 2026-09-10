import type { IntroSet, StarterGarage } from './types.ts'

/**
 * The four loaner garages from DESIGN.md 5: always raceable and never owned, so they can never
 * be broken and a new player is racing at once. What a fresh collection owns is INTRO_SET at the
 * foot of this file, not these.
 *
 * They are cut by **how you win**, not by car type. A type-themed loaner teaches a player what
 * an EV is; it does not teach them how to play, and the EV garage had drifted to three EVs and
 * two Off-road cars anyway. So each one is a way to take the match — race early, bank fuel, bolt
 * on parts, or stall the other side — and each spans several types, with all six across the
 * twenty cars. Type is a means here rather than the theme: JDM and Off-road carry the x1.2
 * distance multiplier, Luxury halves wear, Muscle adds top end, EV adds a launch, JDM gets a
 * third part slot, Sports fixes its first coin flip.
 *
 * The four decks between them run **every one of the 33 mods**, so the set is also a tour of the
 * card pool. Redline and Fuel Drain had never appeared in a loaner deck before this.
 *
 * With the CPU on both sides each garage wins about half its matches overall -- 49, 46, 52 and
 * 54 at 40,000 matches on seed 1 -- and they beat each other in a cycle: Street Kings over The
 * Long Game 63%, The Long Game over Tuners 52%, Tuners over Spoilers 55%, Spoilers over Street
 * Kings 65%. The two pairings across the cycle are measured too, at 48% and 49%, so it is a
 * finding rather than an assumption. Say the second link honestly: at 52, 50 and 49 on three
 * seeds The Long Game and Tuners are level, and only the other three links are real.
 */

/** Expands [modId, copies] pairs into a flat deck list. */
function deck(entries: ReadonlyArray<readonly [string, number]>): readonly string[] {
  return entries.flatMap(([id, copies]) => Array.from({ length: copies }, () => id))
}

export const STARTERS: readonly StarterGarage[] = [
  {
    id: 'street-kings',
    name: 'Street Kings',
    style: 'race early and often',
    // Cheap to fuel and quick off the line: nothing here costs more than 2, so it can advance on
    // turn 2 and keep restaging. Three of the five ride a x1.2 multiplier.
    cars: ['ford-mustang-gt', 'honda-civic-si', 'mazda-rx-7', 'bmw-x5-m', 'porsche-911-carrera-s'],
    // Everything here stacks on the first advance, which is also what a Traction sabotage takes
    // away: with no answer at all this garage lost 88% of its matches to Spoilers. One Launch
    // Control is the whole fix. Three of them was tried and undoes something else -- a stall
    // that can always be shrugged off is a stall Pro gains nothing by timing, and the gap
    // between the CPU levels closed with it.
    deck: deck([
      ['two-step', 3],
      ['perfect-launch', 3],
      ['drag-slicks', 3],
      ['power-shift', 3],
      ['pit-crew', 3],
      ['launch-control', 1],
      ['wheelspin', 2],
      ['stage-2-tune', 3],
      ['turbo-kit', 3],
      ['anti-lag', 2],
      ['red-light', 2],
      ['roadblock', 2],
    ]),
  },
  {
    id: 'long-game',
    name: 'The Long Game',
    style: 'bank fuel, win late',
    // Big cars paid for from the bench. The Miata is the turn-2 car that buys time while the
    // Aventador fills; the AMG halves its own wear and the Model X gives Regen somewhere to land.
    cars: [
      'lamborghini-aventador-svj',
      'mercedes-amg-gt-r',
      'tesla-model-x-plaid',
      'ford-f-150-raptor-r',
      'mazda-mx-5-miata',
    ],
    deck: deck([
      ['extra-tank', 3],
      ['tow-truck', 3],
      ['fuel-cell', 3],
      ['regen', 3],
      ['supercharger', 3],
      ['roll-cage', 2],
      ['aero-package', 2],
      ['sponsor', 2],
      ['nitrous-shot', 3],
      ['fuel-dump', 1],
      ['fuel-siphon', 2],
      ['missed-shift', 2],
      ['redline', 1],
    ]),
  },
  {
    id: 'tuners',
    name: 'Tuners',
    style: 'the deck does the work',
    // Ordinary cars made fast by what is bolted to them. Three of the five are JDM for the third
    // part slot, which is what makes Anti-Lag and a +55% hp stack worth building around.
    cars: [
      'toyota-gr-supra-3-0',
      'honda-civic-type-r-fl5',
      'acura-integra-type-r',
      'chevrolet-corvette-stingray-c8',
      'hyundai-ioniq-5-n',
    ],
    // Thirteen Parts, not twenty: past the slots a car has, a Part in hand is a dead card, and
    // the first draft lost on that. The rest is what makes them pay -- Sponsor to find one,
    // Anti-Lag to cash them, Pit Crew to keep drawing -- plus Wheelie Bar, which is the only
    // permanent answer to a Red Light in any of the four decks.
    deck: deck([
      ['turbo-kit', 3],
      ['supercharger', 3],
      ['stage-2-tune', 2],
      ['weight-reduction', 3],
      ['wheelie-bar', 2],
      ['anti-lag', 3],
      ['sponsor', 3],
      ['pit-crew', 3],
      ['perfect-launch', 2],
      ['power-shift', 2],
      ['overdrive', 3],
      ['wheelspin', 1],
    ]),
  },
  {
    id: 'spoilers',
    name: 'Spoilers',
    style: 'slow the other side down',
    // Wins on the other player's turn: the deck is the plan, and this is the only one that runs
    // Fuel Drain, the game's single rare. The cars are otherwise unremarkable on purpose, with
    // one exception -- the Hellcat is here because Rookie stages the biggest advance and ignores
    // what it costs to fill, so a garage with nothing expensive in it never punishes that.
    cars: [
      'dodge-charger-srt-hellcat',
      'toyota-supra-turbo-a80',
      'kia-ev6-gt',
      'range-rover-p530',
      'dodge-challenger-sxt',
    ],
    // Fifteen Sabotage, not twenty-two. Only one may be played a turn, so past about half the
    // deck the extra copies buy nothing and the garage was simply the strongest thing in the
    // game: at twenty-two it took 89% off Street Kings and 70% off Tuners. The other half is an
    // ordinary racing deck, because a garage that only stalls never finishes the quarter mile.
    deck: deck([
      ['red-light', 1],
      ['oil-slick', 2],
      ['missed-shift', 2],
      ['bad-tune', 2],
      ['roadblock', 2],
      ['wheelspin', 2],
      ['parts-thief', 1],
      ['fuel-siphon', 1],
      ['fuel-drain', 1],
      ['weight-reduction', 2],
      ['stage-2-tune', 2],
      ['carbon-body-kit', 3],
      ['launch-control', 2],
      ['pit-crew', 3],
      ['power-shift', 2],
      ['perfect-launch', 2],
    ]),
  },
]

/**
 * The intro set (DESIGN.md 12): what a fresh collection owns. Six cars kept from the loaner
 * garages, none above Performance, so every Super and Hyper is opened rather than given. The
 * cars were picked by measurement, not by looks: a first pass on slower ones left the set at
 * 25% against the field where the loaners run 43 to 50, and these bring it to 46. The mods are
 * the consistent half of the pool at two copies each, one below the deck cap, so no pack slot
 * is dead on the first pack. Concentrating them into a three-copy spine was tried and dropped:
 * it bought about three points and cost six live pack slots. The type-locked mods are held
 * back deliberately, and every one of them has a car here to land on.
 *
 * It did not move when the garages were re-cut: all six are still loaner cars, spread across
 * three of the four garages, so the measurement above still stands.
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
