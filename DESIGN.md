# Pink Slips — Design

A web trading card game where real cars drag race a quarter mile. The winner of each race takes the loser's car. First to three pink slips wins the match.

The rules mirror the Pokémon Trading Card Game so anyone who has played it can pick this up in one match: a garage instead of a bench, fuel instead of energy, mods instead of attacks, pink slips instead of prize cards.

This document is the source of truth for the game. `BUILD_PLAN.md` is the source of truth for the order things get built. Every number marked **tunable** is a starting value to be validated by the simulator (phase 5), not a final decision.

---

## 1. Vocabulary

| Term | Meaning |
|---|---|
| **Match** | A full game between two players. Ends when one player holds 3 pink slips. |
| **Race** | One car versus one car to 1320 ft. A match contains several races. |
| **Garage** | A player's 5 cars. Face up. The Pokémon bench. |
| **Staged car** | The car currently racing. The Pokémon active slot. |
| **Fuel** | A token placed on a car. A car needs fuel equal to its fuel cost before it can advance. Never consumed by advancing. |
| **Advance** | The distance a staged car moves in one turn, in feet. |
| **Mod** | A card from the mod deck. Three families: Part, Boost, Sabotage. |
| **Part** | A mod that attaches to a car permanently and takes a slot. |
| **Boost** | A one-shot mod that helps your own car. |
| **Sabotage** | A one-shot mod that hurts the opponent's staged car. Two kinds: Traction and Pit. |
| **Wear** | A counter on a car. Each race win adds one. Each point cuts that car's advance. |
| **Pink slip** | A car captured by winning a race. Goes to the winner's prize pile. Cannot be raced. |
| **Tier** | The rarity band of a car, set by power-to-weight. Determines fuel cost. |
| **Type** | The character of a car. Each type has one mechanical identity. |
| **CPU** | The computer opponent. |

---

## 2. Cards

### 2.1 Car cards

Every car is a real production car with manufacturer-published figures.

**Mechanical fields** (affect play):

| Field | Use |
|---|---|
| `hp` | Horsepower. Numerator of the advance formula. |
| `weightLb` | Curb weight in pounds. Denominator of the advance formula. |
| `tier` | Sets fuel cost. Derived from `hp / weightLb`. |
| `type` | Grants the type's mechanical identity. |

**Flavor fields** (printed, no effect in v1): drivetrain, zero to sixty, top speed, engine, production years.

**Data fields**: `id`, `name`, `make`, `model`, `generation` (only when needed to disambiguate), `source` (where the figures came from), `imageUrl` (empty in v1).

### 2.2 Tiers

Tier is assigned by **power-to-weight** in hp per pound, because that is what the advance formula uses. A tier assigned by raw horsepower would give a 720 hp truck the fuel cost of a hypercar and the speed of a pony car.

| Tier | Rarity label | hp / lb | Fuel cost (tunable) |
|---|---|---|---|
| **Daily** | Common | below 0.080 | 1 |
| **Performance** | Uncommon | 0.080 to 0.139 | 2 |
| **Super** | Rare | 0.140 to 0.199 | 3 |
| **Hyper** | Ultra Rare | 0.200 and up | 5 |

Bands are guidelines. A car sitting within 0.005 of a boundary may be placed by judgment, and the placement is recorded in the data with a note.

Consequences of this rule, accepted as honest to the real cars:

- Heavy types top out low. Off-road has no Super or Hyper cars. JDM has no Hyper cars.
- Some famous cars land lower than their badge suggests. The F-150 Raptor is Daily. The Rolls-Royce Wraith is Performance.
- The roster grid is uneven. Two cars per tier-and-type cell is the target, not a rule.

Holo and foil variants are a post-v1 feature tied to packs. They will be cosmetic only.

### 2.3 Types

Type is a car's character, not its brand. A front-engine V12 Ferrari grand tourer is Luxury. A Corvette is Muscle. A Subaru WRX is Off-road.

| Type | Identity | Mechanic (magnitudes tunable) |
|---|---|---|
| **EV** | instant torque | +100 ft on the car's first advance of each race |
| **Muscle** | top end | +75 ft on any advance that starts at or past 660 ft |
| **JDM** | tuner | 3 part slots instead of 2 |
| **Sports** | precision | the first coin flip this car makes each race is heads |
| **Luxury** | built to last | wear penalty halved for this car |
| **Off-road** | traction | immune to Traction sabotage |

### 2.4 Roster (v1)

52 cars. The 30 marked ★ were requested by name and are fixed. The rest are fillers chosen to give every cell at least one car where a real car exists for it, and may be swapped in phase 1 if a better fit is found. Specs below are approximate and are verified with sources in phase 1.

**Sports**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | Mazda MX-5 Miata (ND) | 181 | 2,350 |
| Daily | Toyota GR86 | 228 | 2,850 |
| Performance | ★ Porsche 911 Carrera S (992) | 443 | 3,400 |
| Performance | ★ Lotus Emira V6 | 400 | 3,200 |
| Super | ★ Ferrari F430 | 483 | 3,200 |
| Super | ★ Ferrari 458 Italia | 562 | 3,300 |
| Super | ★ Lamborghini Murciélago LP640 | 631 | 3,700 |
| Hyper | ★ Lamborghini Aventador SVJ | 759 | 3,750 |
| Hyper | ★ Lamborghini Temerario | 907 | 3,725 |
| Hyper | ★ McLaren 765LT | 755 | 3,000 |

**Luxury**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | Lexus IS 300 | 241 | 3,700 |
| Daily | Mercedes-Benz C 300 | 255 | 3,700 |
| Performance | ★ Rolls-Royce Wraith | 624 | 5,380 |
| Performance | Lexus LC 500 | 471 | 4,300 |
| Super | ★ BMW M5 Competition (F90) | 617 | 4,350 |
| Super | ★ Mercedes-AMG GT R | 577 | 3,600 |
| Super | ★ Aston Martin DBS Superleggera | 715 | 4,000 |
| Hyper | ★ Ferrari 812 Superfast | 789 | 3,600 |
| Hyper | ★ Ferrari 12Cilindri | 819 | 3,500 |

**Muscle**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | Dodge Charger SXT | 292 | 4,000 |
| Daily | Ford Mustang 289 (1967) | 200 | 2,900 |
| Performance | ★ Chevrolet Camaro SS 1LE (6th gen) | 455 | 3,700 |
| Performance | ★ Ford Mustang GT 5.0 | 450 | 3,750 |
| Performance | ★ Dodge Challenger SRT8 6.1 | 425 | 4,100 |
| Performance | ★ Plymouth Hemi 'Cuda (1970) | 425 | 3,850 |
| Super | ★ Chevrolet Corvette Z06 (C6) | 505 | 3,130 |
| Super | ★ Dodge Viper (Gen 5) | 645 | 3,375 |
| Hyper | Dodge Challenger SRT Demon 170 | 1,025 | 4,275 |
| Hyper | Chevrolet Corvette ZR1 (C8) | 1,064 | 3,800 |

**JDM**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | ★ Honda Civic Si | 200 | 2,900 |
| Daily | ★ Acura Integra Type R (DC2) | 195 | 2,600 |
| Daily | ★ Nissan Altima 2.5 | 188 | 3,200 |
| Performance | ★ Honda S2000 | 240 | 2,800 |
| Performance | ★ Mazda RX-7 (FD) | 255 | 2,800 |
| Super | ★ Nissan GT-R (R35) | 565 | 3,850 |
| Super | Nissan GT-R NISMO | 600 | 3,865 |
| Super | Acura NSX (2nd gen) | 573 | 3,800 |

**EV**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | ★ Toyota Prius | 194 | 3,100 |
| Daily | Nissan Leaf | 147 | 3,500 |
| Performance | Tesla Model 3 Performance | 455 | 4,050 |
| Performance | Hyundai Ioniq 5 N | 641 | 4,900 |
| Super | Porsche Taycan Turbo S | 750 | 5,100 |
| Super | Lucid Air Grand Touring | 819 | 5,200 |
| Hyper | ★ Tesla Model S Plaid | 1,020 | 4,800 |
| Hyper | Rimac Nevera | 1,914 | 5,100 |

**Off-road**

| Tier | Car | hp | lb |
|---|---|---|---|
| Daily | Jeep Wrangler Rubicon | 285 | 4,300 |
| Daily | Toyota Tacoma TRD | 278 | 4,400 |
| Daily | ★ Ford F-150 Raptor | 450 | 5,700 |
| Performance | ★ Subaru WRX STI | 310 | 3,400 |
| Performance | Ford F-150 Raptor R | 720 | 6,000 |
| Performance | Ram 1500 TRX | 702 | 6,400 |
| Performance | Lamborghini Urus | 641 | 4,850 |

### 2.5 Mod cards

**Families**

| Family | Timing | Target | Limit |
|---|---|---|---|
| **Part** | attaches permanently | your car, any in garage | open slots on that car (2, JDM 3) |
| **Boost** | one-shot, discarded | your staged car or your turn | one per turn |
| **Sabotage: Traction** | one-shot, discarded | opponent's staged car's next advance | one Sabotage per turn |
| **Sabotage: Pit** | one-shot, discarded | opponent's staged car's fuel, parts, or wear | one Sabotage per turn |

Boosts outnumber Sabotage roughly three to one. A few mods are type-locked and say so on the card. Some Boosts cost fuel to play, which is removed from the staged car when played, so fuel above the car's cost has a use.

**Starting mod set** (30 unique, all values tunable)

Parts:

| Mod | Effect |
|---|---|
| Turbo Kit | +20% hp |
| Supercharger | +25% hp |
| Stage 2 Tune | +10% hp |
| Weight Reduction | −300 lb |
| Carbon Body Kit | −150 lb |
| Drag Slicks | +100 ft on this car's first advance of each race |
| Aero Package | +50 ft on advances that start at or past 660 ft |
| Fuel Cell | this car's fuel cost −1, minimum 1 |
| Roll Cage | this car gains no wear from winning |
| Wheelie Bar | this car is immune to Traction sabotage |

Boosts:

| Mod | Effect |
|---|---|
| Nitrous Shot | costs 1 fuel. Coin flip: heads +200 ft, tails +50 ft |
| Power Shift | +100 ft this advance |
| Perfect Launch | +150 ft if this is the car's first advance of the race |
| Redline | +50% this advance, then this car gains 1 wear |
| Fuel Dump | remove 1 fuel from this car: +250 ft this advance |
| Overdrive | coin flip: heads, advance a second time this turn at half distance |
| Launch Control | this car's next advance cannot be reduced by Traction sabotage |
| Extra Tank | place one additional fuel this turn |
| Tow Truck | move all fuel from one of your cars to another of your cars |
| Pit Crew | draw 2 cards |
| Sponsor | search your deck for a Part, put it in your hand, shuffle |
| Two-Step | **Muscle only**. +150 ft on this car's first advance of the race |
| Anti-Lag | **JDM only**. Every Part on this car gives an additional +5% hp this advance |
| Regen | **EV only**. Place one fuel on this car |

Sabotage, Traction:

| Mod | Effect |
|---|---|
| Wheelspin | opponent's next advance −100 ft |
| Missed Shift | opponent's next advance halved |
| Red Light | if the opponent's staged car has not advanced this race, it skips its next advance |
| Oil Slick | opponent's next advance −50 ft. Coin flip: heads, −50 ft more |

Sabotage, Pit:

| Mod | Effect |
|---|---|
| Fuel Siphon | remove 1 fuel from the opponent's staged car |
| Parts Thief | discard one Part from the opponent's staged car, their choice |
| Roadblock | opponent cannot play a Boost on their next turn |
| Bad Tune | opponent's staged car gains 1 wear |

---

## 3. Match rules

### 3.1 Setup

1. Each player brings a garage of exactly 5 cars and a mod deck of 30 cards. Max 3 copies of any mod.
2. Garages are face up for the whole match, including fuel, parts, and wear on every car. Hands are hidden.
3. Each player shuffles their mod deck and draws 5.
4. Coin flip decides who goes first.
5. Each player stages one car from their garage. Both staged cars start at 0 ft.

### 3.2 Turn

Players alternate. A turn has four steps in this order.

1. **Draw** one card. If the deck is empty, shuffle the discard pile into the deck first. There is no loss for running out.
2. **Fuel**: place one fuel token on any car in your garage, staged or not.
3. **Mods**: play any number of Parts into open slots on any of your cars, at most one Boost, and at most one Sabotage.
4. **Advance**: if your staged car has fuel at or above its fuel cost, it advances. See 3.3.

The first player skips the Advance step on their first turn.

### 3.3 Advance

Computed in this order. All results floor to whole feet, minimum 0.

1. Effective hp = `hp × (1 + sum of percentage hp modifiers from Parts and Boosts)`
2. Effective weight = `weightLb − sum of weight reductions`
3. Base = `floor(K × effective hp ÷ effective weight)` where **K = 3000** (tunable)
4. Add flat bonuses: type identity, Parts, Boosts
5. Apply Sabotage pending on this car: flat reductions first, then halving
6. Apply wear: `× (1 − wearRate × wearCount)` where **wearRate = 0.10** (tunable). Luxury uses half the rate.
7. If the car's distance reaches or passes **1320 ft**, the race ends immediately.

Worked example at K = 3000, no mods: Civic Si advances 206 ft and needs 7 advances. Mustang GT advances 360 ft and needs 4. Aventador SVJ advances 607 ft and needs 3. Rimac Nevera advances 1,126 ft and needs 2.

### 3.4 Race end

1. The winning player takes the losing car as a **pink slip** into their prize pile. Its fuel and parts are discarded.
2. The winning car gains **1 wear**.
3. Both players may stage any car from their garage. The loser must, since their staged slot is empty. The winner may keep the same car or swap for free. Wear, fuel, and parts stay on the car they are on.
4. Both staged cars reset to 0 ft. Pending sabotage is cleared.
5. Play continues with the next turn in normal alternation.

### 3.5 Match end

A player holding **3 pink slips** wins immediately. Garages of 5 and a win at 3 mean a garage can never empty first.

### 3.6 Coin flips

A coin flip is a 50/50 result from the engine's seeded random number generator. The Sports type identity forces the first flip a Sports car makes each race to heads.

---

## 4. Tunables

Every value here is a starting point. Phase 5 runs the simulator and adjusts them against evidence. Values live in one file, `src/engine/tunables.ts`, and nothing else hardcodes them.

| Tunable | Start | Rationale |
|---|---|---|
| Track length | 1320 ft | a quarter mile, fixed by theme |
| K (advance constant) | 3000 | a Daily car finishes in about 7 advances, a Hyper in about 3 |
| Fuel cost by tier | 1 / 2 / 3 / 5 | Hyper's jump to 5 is deliberate: it should need bench time |
| Wear rate | 10% per win | three wins cost a car nearly a third of its speed |
| Part slots | 2, JDM 3 | |
| Garage size | 5 | |
| Pink slips to win | 3 | |
| Mod deck size | 30 | |
| Hand size at start | 5 | |
| Draw per turn | 1 | |
| Copies of one mod | 3 | |
| Boosts per turn | 1 | |
| Sabotage per turn | 1 | |
| Type bonus magnitudes | as listed in 2.3 | |
| Mod values | as listed in 2.5 | |

---

## 5. Starter garages

Three prebuilt garages ship in v1 so a new player is racing within ten seconds. Each has a 30-card mod deck built for its style. Exact decklists are finalized in phase 7 after the simulator has tuned the numbers.

| Name | Style | Cars |
|---|---|---|
| **Street Kings** | cheap tempo, race early and often | Mustang GT, Camaro SS 1LE, RX-7, S2000, Civic Si |
| **Exotic Garage** | fuel the bench, win late with big cars | Aventador SVJ, 458 Italia, AMG GT R, 911 Carrera S, Miata |
| **Electric Avenue** | launch bonuses and traction immunity | Model S Plaid, Ioniq 5 N, Raptor R, WRX STI, Prius |

---

## 6. CPU opponent

One rule-based opponent, used both in play and by the simulator. It never cheats: it sees only what a human would see. Priorities, in order:

1. If the staged car can win this advance with a Boost in hand, play it.
2. If the opponent's staged car would win on its next advance and a Sabotage in hand prevents that, play it.
3. Fuel placement: if the staged car is under its cost, fuel it. Otherwise fuel the garage car with the best advance per fuel remaining.
4. Attach Parts to the car with the most races likely left in it.
5. Between races, stage the car with the highest ready advance, preferring lower wear.

Difficulty levels are post-v1.

---

## 7. Simulator

A headless command, `npm run sim`, that plays CPU against CPU for thousands of matches with a fixed seed and prints a report. It exists so balance is argued from evidence.

**Reports**

- Win rate by garage type composition and by tier composition
- Average match length in turns per player, and distribution
- Mod play rates and win rate when played
- Race outcomes by tier matchup

**Starting targets** (tunable)

- No single-type garage wins more than 60% against the field
- No single-tier garage wins more than 65% against the field
- A Daily-only garage against a Hyper-only garage lands between 35% and 65%
- Median match is 25 or fewer turns per player

**Known risks the simulator must check first**

- Heavy types (Off-road, Luxury at low tiers) may be unplayable on pure power-to-weight. First lever if so: a per-type distance multiplier. Second lever: tier fuel costs.
- Hyper fuel cost 5 may be too slow to ever matter, or bench fueling may make it free. First lever: K and the cost step.
- Wear at 10% may make swapping always correct, which removes the decision. First lever: wear rate.

---

## 8. Visual design

**Retro trading card.** The precedent for layout is Top Trumps, the 1970s car stat card game: portrait card, car name across the top, a stat block down one side. The precedent for stock and border is the 1999 Pokémon Base Set: cream body, thick colored border, a boxed image area. The image area holds a stylized placeholder in v1 and an illustration later.

- Border color by type. Foil treatment reserved for post-v1 holo variants.
- Typography from Google Fonts: a condensed display face for names, a monospace face for stats. Real fallback stacks.
- Race screen: two lanes viewed from above, a car marker per lane advancing toward a finish line, distance in feet under each. Minimal animation in v1: markers slide, nothing else.
- Hotseat shows a hand-over screen between turns so hands stay hidden.
- Desktop first. Usable on a phone.
- Palette and type choices are made in phase 6 and recorded here.

---

## 9. Architecture

Single web app, no backend.

```
src/
  data/        cars.ts, mods.ts, starters.ts      static card data, validated by tests
  engine/      pure TypeScript, no UI imports       match state, rules, tunables, seeded RNG
  cpu/         pure TypeScript                      the opponent, drives the engine API
  sim/         node script                          runs cpu vs cpu, prints reports
  ui/          React                                screens, card component, race view
```

**Engine API shape**

- `createMatch(config, seed) → MatchState`
- `legalActions(state, player) → Action[]`
- `apply(state, action) → MatchState`, immutable, returns a new state
- `isOver(state) → winner | null`

The engine is deterministic given a seed. Every rule in section 3 is a unit test. The UI and the CPU only ever call this API, so online play later means moving the engine behind a server, not rewriting it.

**Persistence**: custom garages and decks in `localStorage`, wrapped in try/catch, with starters always available.

**Stack**: TypeScript, React, Vite, Vitest. Deployed as a static site to GitHub Pages.

---

## 10. Scope

**v1**

- 52 cars, 30 mods, 3 starter garages
- CPU and hotseat play
- Every card unlocked
- Deck builder with saved garages
- Simulator and tuned numbers
- Live URL

**Post-v1 backlog, in likely order**

1. Illustrated card art in one consistent style
2. Packs and a collection, with holo and foil variants
3. CPU difficulty levels
4. Online play

---

## 11. Legal

Code is MIT licensed. Car names and marques are trademarks of their respective manufacturers. This project is unaffiliated with and not endorsed by any of them. The README carries the same note.
