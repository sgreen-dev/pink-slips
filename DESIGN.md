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
| **Super** | Rare | 0.140 to 0.199 | 4 |
| **Hyper** | Ultra Rare | 0.200 and up | 6 |

Bands are guidelines. A car sitting within 0.005 of a boundary may be placed by judgment, and the placement is recorded in the data with a note.

Consequences of this rule, accepted as honest to the real cars:

- Heavy types top out low. Off-road has no Super or Hyper cars. JDM has no Hyper cars.
- Some famous cars land lower than their badge suggests. The F-150 Raptor is Daily. The Rolls-Royce Wraith is Performance.
- The roster grid is uneven. Two cars per tier-and-type cell is the target, not a rule.

Holo and foil variants came with phase 12. They are cosmetic only; see section 12.

### 2.3 Types

Type is a car's character, not its brand. A front-engine V12 Ferrari grand tourer is Luxury. A Corvette is Muscle. A Subaru WRX is Off-road.

| Type | Identity | Mechanic (magnitudes tunable) |
|---|---|---|
| **EV** | instant torque | +75 ft on the car's first advance of each race |
| **Muscle** | top end | +75 ft on any advance that starts at or past 660 ft |
| **JDM** | tuner | 3 part slots instead of 2 |
| **Sports** | precision | the first coin flip this car makes each race is heads |
| **Luxury** | built to last | wear penalty halved for this car |
| **Off-road** | traction | immune to Traction sabotage |

### 2.4 Roster (v1)

102 cars. The 30 marked ★ were requested by name and are fixed. The other 22 of the first 52 were fillers chosen to give every cell at least one car where a real car exists for it, and 50 more were added afterwards to bring every type to 17, with tiers split 5, 5, 4, 3 where real cars exist and spread across each band; JDM and Off-road have no Ultra Rare car. Specs below are the approximate figures the roster was chosen with. The verified figures, with a source per car, live in `src/data/cars.ts`; where a manufacturer publishes only a dry weight, that is what is used and the source says so.

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
| Daily | Porsche 914 (1.7) | 79 | 2,072 |
| Daily | Mazda MX-5 Miata (NA) | 115 | 2,160 |
| Daily | Toyota MR2 Spyder | 138 | 2,195 |
| Performance | Porsche Boxster S (987) | 310 | 2,987 |
| Performance | BMW Z4 M40i | 382 | 3,443 |
| Performance | Porsche 718 Cayman GTS 4.0 | 394 | 3,031 |
| Super | Porsche 911 Turbo S (992) | 640 | 3,615 |

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
| Daily | Lexus ES 250 | 203 | 3,780 |
| Daily | Mercedes-Benz E 300 | 241 | 3,650 |
| Daily | BMW 330i | 255 | 3,582 |
| Performance | Cadillac CT5-V | 360 | 3,974 |
| Performance | Bentley Continental GT V8 | 542 | 4,771 |
| Performance | Mercedes-AMG C 63 S (W205) | 503 | 3,957 |
| Super | BMW M8 Competition | 617 | 4,156 |
| Hyper | Ferrari 812 Competizione | 819 | 3,278 |

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
| Daily | Ford Mustang 200 Six (1965) | 120 | 2,445 |
| Daily | Ford Mustang V6 (2005) | 210 | 3,300 |
| Daily | Dodge Challenger SXT | 305 | 3,894 |
| Performance | Ford Mustang Mach 1 (2021) | 480 | 3,868 |
| Super | Dodge Challenger SRT Hellcat | 717 | 4,449 |
| Super | Ford Shelby GT500 (2020) | 760 | 4,171 |
| Hyper | Chevrolet Corvette ZR1 (C7) | 755 | 3,560 |

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
| Daily | Nissan 240SX (S14) | 155 | 2,800 |
| Daily | Mazda MX-5 Miata (NB) | 140 | 2,348 |
| Daily | Toyota Celica GT-S (2000) | 180 | 2,500 |
| Performance | Mitsubishi Lancer Evolution IX | 286 | 3,263 |
| Performance | Acura NSX (1991) | 270 | 3,010 |
| Performance | Honda Civic Type R (FL5) | 315 | 3,188 |
| Performance | Toyota GR Supra 3.0 | 382 | 3,400 |
| Super | Acura NSX Type S | 600 | 3,891 |
| Super | Lexus LFA | 552 | 3,263 |

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
| Daily | Volkswagen ID.4 Pro | 201 | 4,559 |
| Daily | Chevrolet Bolt EV | 200 | 3,589 |
| Daily | Ford F-150 Lightning | 426 | 6,015 |
| Performance | Volvo C40 Recharge Twin | 402 | 4,710 |
| Performance | Rivian R1T | 600 | 6,585 |
| Performance | Kia EV6 GT | 576 | 4,795 |
| Super | Lotus Eletre R | 905 | 5,930 |
| Super | Tesla Model X Plaid | 1020 | 5,248 |
| Hyper | Lucid Air Sapphire | 1234 | 5,336 |

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
| Daily | Toyota 4Runner SR5 | 270 | 4,400 |
| Daily | Toyota Land Cruiser (2024) | 326 | 5,038 |
| Daily | Ford Ranger Raptor | 405 | 5,325 |
| Performance | Mercedes-AMG G 63 | 577 | 5,842 |
| Performance | BMW X5 M | 600 | 5,455 |
| Performance | Dodge Durango SRT Hellcat | 710 | 5,710 |
| Performance | Jeep Grand Cherokee Trackhawk | 707 | 5,363 |
| Super | Aston Martin DBX707 | 697 | 4,949 |
| Super | Lamborghini Urus SE | 789 | 5,522 |
| Super | Ferrari Purosangue | 715 | 4,784 |

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
3. Base = `floor(K × effective hp × type multiplier ÷ effective weight)` where **K = 3000** (tunable) and the type multiplier is 1 for Sports, Muscle, and EV, 1.1 for Luxury, and 1.2 for JDM and Off-road (tunable, set in phase 5)
4. Add flat bonuses: type identity, Parts, Boosts
5. Apply Sabotage pending on this car: flat reductions first, then halving
6. Apply wear: `× (1 − wearRate × wearCount)` where **wearRate = 0.10** (tunable). Luxury uses half the rate.
7. If the car's distance reaches or passes **1320 ft**, the race ends immediately.

Worked example at K = 3000, no mods, using the verified figures in `src/data/cars.ts`: Civic Si (200 hp, 2,952 lb, JDM ×1.2) advances 243 ft and needs 6 advances. Mustang GT (460 hp, 3,705 lb) advances 372 ft and needs 4. Aventador SVJ (759 hp, 3,362 lb dry) advances 677 ft and needs 2. Rimac Nevera (1,914 hp, 5,071 lb) advances 1,132 ft and needs 2.

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
| K (advance constant) | 3000 | a Daily car finishes in about 6 advances, a Hyper in 2 or 3 |
| Fuel cost by tier | 1 / 2 / 4 / 6 | started at 1 / 2 / 3 / 5; phase 5 found the top two tiers needed a steeper step |
| Per-type distance multiplier | 1 / 1.1 / 1 / 1.2 / 1 / 1.2 (Sports, Luxury, Muscle, JDM, EV, Off-road) | phase 5 lever for the heavy and low-tier types; 1 everywhere to start |
| Wear rate | 10% per win | three wins cost a car nearly a third of its speed |
| Part slots | 2, JDM 3 | |
| Garage size | 5 | |
| Packs per match | 1, or 2 for beating the CPU or an online opponent | phase 11; a pack every match or two keeps packs frequent, and a full collection is a long goal (section 12) |
| Pack contents | 2 cars, 3 mods | phase 11 |
| Car tier odds in a pack | 55 / 30 / 12 / 3 (Common, Uncommon, Rare, Ultra Rare) | phase 11; rarity labels mean something |
| Foil and holo odds per pack card | 10% foil, 2% holo | phase 12; a foil most packs, a holo now and then |
| Pink slips to win | 3 | |
| Mod deck size | 30 | |
| Hand size at start | 5 | |
| Draw per turn | 1 | |
| Copies of one mod | 3 | |
| Boosts per turn | 1 | |
| Sabotage per turn | 1 | |
| Type bonus magnitudes | as listed in 2.3 | EV launch bonus started at 100 ft; phase 5 cut it to 75 |
| Mod values | as listed in 2.5 | |

---

## 5. Starter garages

Three prebuilt garages ship in v1 so a new player is racing within ten seconds. Each has a 30-card mod deck built for its style. The decklists below were finalized in phase 7 against the tuned numbers.

| Name | Style | Cars |
|---|---|---|
| **Street Kings** | cheap tempo, race early and often | Mustang GT, Camaro SS 1LE, RX-7, S2000, Civic Si |
| **Exotic Garage** | fuel the bench, win late with big cars | Aventador SVJ, 458 Italia, AMG GT R, 911 Carrera S, Miata |
| **Electric Avenue** | launch bonuses and traction immunity | Model S Plaid, Ioniq 5 N, Raptor R, WRX STI, Prius |

**Decklists** (30 cards each)

- **Street Kings**: Two-Step ×3, Anti-Lag ×2, Perfect Launch ×3, Power Shift ×3, Drag Slicks ×2, Stage 2 Tune ×3, Turbo Kit ×2, Pit Crew ×3, Wheelspin ×3, Red Light ×2, Bad Tune ×2, Roadblock ×2
- **Exotic Garage**: Extra Tank ×3, Tow Truck ×3, Fuel Cell ×3, Sponsor ×2, Supercharger ×3, Carbon Body Kit ×2, Roll Cage ×2, Nitrous Shot ×3, Fuel Dump ×2, Fuel Siphon ×3, Missed Shift ×2, Parts Thief ×2
- **Electric Avenue**: Regen ×3, Drag Slicks ×2, Perfect Launch ×2, Launch Control ×2, Wheelie Bar ×2, Weight Reduction ×2, Extra Tank ×2, Aero Package ×2, Overdrive ×2, Oil Slick ×2, Red Light ×1, Bad Tune ×2, Pit Crew ×3, Sponsor ×3

With the CPU on both sides each garage wins about half its matches overall, and they beat each other in a cycle: Street Kings over Exotic Garage, Exotic Garage over Electric Avenue, Electric Avenue over Street Kings, each near 60%. Sabotage that stalls a first advance, Red Light above all, swings these matchups more than any Part or Boost, which is why Exotic Garage carries none and Electric Avenue carries one.

---

## 6. CPU opponent

One rule-based opponent, used both in play and by the simulator. It never cheats: it sees only what a human would see. Priorities, in order:

1. If the staged car can win this advance with a Boost in hand, play it.
2. If the opponent's staged car would win on its next advance and a Sabotage in hand prevents that, play it.
3. Fuel placement: if the staged car is under its cost, fuel it. Otherwise fuel the garage car with the best advance per fuel remaining.
4. Attach Parts to the car with the most races likely left in it.
5. Between races, stage the car with the highest ready advance, preferring lower wear.

When none of those applies, the CPU still uses its turn. It attaches any Part that improves a car. It plays a Boost worth at least 50 ft on an advance it will make this turn, counting fuel and cards a Boost gives as worth something too, and a Sabotage that takes at least 50 ft off an advance the opponent is ready to make. It never plays a Boost that would leave its staged car unable to advance. It reads every coin flip as tails unless the Sports rule makes heads certain, and assumes the opponent's hand is empty. Exact ties between equal choices are broken by a seed, so the CPU is deterministic given a state and a seed.

**Levels** (phase 13). Three levels, chosen at match start, default Street. *Rookie* fuels and stages by the rules above but never uses the win rule or the stop rule, spends a Boost or Sabotage only when it is worth twice the usual threshold, and stages by highest advance alone, ignoring fuel and wear. *Street* is the opponent described above, unchanged. *Pro* adds four things: it holds a first-advance stall such as Red Light until the opponent's staged car is fueled and about to make its first advance; it stages the car that finishes a race in the fewest turns with fueling counted, and when it stages second it takes the weakest car that still finishes first with a turn to spare, so a Hyper stays on the bench until it can move and the strong cars stay unworn; it reads coin flips at their expected value instead of as tails; and it values Boosts and Sabotage by the turns they take off its own finish or add to the opponent's rather than by feet, since in a turn-based race only the turn count decides. A rule that fueled only bench cars able to be ready by the end of the current race was tried and dropped: it starved Hypers of fuel and cost Pro matches. A level is a profile of switches the CPU reads and the engine never sees.

**Measured** (`npm run sim -- --levels`, 1,000 matches per pairing, seed 1): over random garages Street beats Rookie 77% and Pro beats Rookie 80%, while Pro and Street split 49 to 51, so on arbitrary garages Street already plays near the ceiling of this rule set. Over the starter pairings, the garages a new player races, Pro beats Street 62%, Street beats Rookie 74%, and Pro beats Rookie 81%. Every level takes about 0.01 ms per action. The next real step up for Pro would be a one-turn lookahead through the engine rather than more rules.

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

**Phase 5 findings** (5,000-match runs, details in `docs/balance-log.md`)

- Heavy types: confirmed. Off-road won 15% against the field and JDM 29% on pure power-to-weight. The per-type distance multiplier fixed it: Off-road 1.2, JDM 1.2, Luxury 1.1 put every type between 49% and 59%.
- Hyper fuel cost: confirmed that bench fueling makes it nearly free. Hyper cars made their first advance 1.4 turns after staging, and Daily-only won 4% against Hyper-only. The cost step was the lever: 1/2/4/6 brought that to about 50%. The matchup is sensitive to the Hyper cost, since it turns on whether a fueled Hyper finishes race 1 before a Daily car does: 7 gave Daily 59% and 8 gave it 77%.
- Wear: not a problem at 10%. Race winners kept their car 58% of the time, so the swap is a real decision. Raising wear to 15% or 20% lowered that to about 50% without helping the other targets.
- EV was the strongest type at 62% through its launch bonus; 75 ft brought it to 58%.
- Matches run about 14 turns per player with the CPU, well under the 25-turn target.

**Roster expansion check** (5,000 matches at seed 1 after the roster grew from 52 to 102 cars): every type between 49% and 55% against the field, tiers 2 / 56 / 63 / 37 for Common, Uncommon, Rare, Ultra Rare, Daily-only against Hyper-only 42%, and the starters at 58%, 56%, and 60% for the first-named side. All four targets still pass, so no tunable moved. Rare sits closest to its cap at 63%: the new Rare cars are strong for a fuel cost of 4, and that is the first thing to watch if a later pass tunes again.

---

## 8. Visual design

**Retro trading card.** The precedent for layout is Top Trumps, the 1970s car stat card game: portrait card, car name across the top, a stat block down one side. The precedent for stock and border is the 1999 Pokémon Base Set: cream body, thick colored border, a boxed image area. The image area holds a stylized placeholder in v1 and an illustration later.

- Border color by type. Foil and holo finishes are CSS overlays on the frame and the art (section 12).
- Typography from Google Fonts: a condensed display face for names, a monospace face for stats. Real fallback stacks.
- Race screen: two lanes viewed from above, a car marker per lane advancing toward a finish line, distance in feet under each. Markers slide. The one other piece of motion is the race-end moment: the track holds at the finishing positions, the winner's finish line flashes, and a banner names the winner and shows the captured car as a pink slip with the tally. It stays until Continue and comes before staging, the hotseat hand-over, and the result screen. Reduced-motion settings keep the banner and drop the motion.
- Hotseat shows a hand-over screen between turns so hands stay hidden.
- Desktop first. Usable on a phone.
- Palette and type choices are made in phase 6 and recorded here.

**Palette and type** (phase 6)

| Role | Value |
|---|---|
| Table | asphalt `#17171a`, panels `#232327`, lines `#3a3a40` |
| Card stock | cream `#f3e7c9`, stat bands `#e6d7b0`, ink `#2b2118` |
| Accent | pink `#ff5ca8` for pink slips, prompts, and targets; gold `#f2c14e` for the staged car and fuel |
| Type borders | Sports `#d7263d`, Luxury `#7a3e9d`, Muscle `#e8731c`, JDM `#1e6fd9`, EV `#1fa37a`, Off-road `#8c6b2f` |
| Mod families | Part `#6b7f99`, Boost `#2e9e5b`, Sabotage `#c0392b` |
| Display face | Bebas Neue, falling back to Oswald, Impact, Arial Narrow |
| Stat face | IBM Plex Mono, falling back to Courier New |
| Body face | the system UI stack |

**Card art** (phase 10)

Every car card carries an illustration in one style, derived from a photograph on Wikimedia Commons by the pipeline in `scripts/art/`. The spec: an 800 by 600 image for the 4:3 art box; a front three-quarter view with the car facing right, the direction the track runs, mirrored when the source faces left; the car cut out of its background, posterized to eight tones with a printed line layer, and set on the card cream `#f3e7c9` with a soft shadow; WebP under 60 KB each and under 3 MB in total. Source photographs must be CC0, public domain, CC BY, or CC BY-SA, and each is credited in `public/art/CREDITS.md`. The illustrations are published under CC BY-SA 4.0. The tinted silhouette stays as the fallback while an image loads or if it fails.

Fonts load from Google Fonts. The card is a portrait 5:7 with a thick type-colored frame, a cream body, the name across the top in the display face, a boxed image area holding a tinted silhouette, a striped stat block in the mono face, and tier and fuel cost along the bottom. Fuel, wear, parts, and Launch Control show as tokens on the frame below the body. The engine defines every interaction: a card lights up pink only when `legalActions` lists a play for it.

---

## 9. Architecture

A static web app, plus two small Cloudflare Workers: the matches-played counter, and the room service that holds online matches (section 13).

```
src/
  data/        cars.ts, mods.ts, starters.ts      static card data, validated by tests
  engine/      pure TypeScript, no UI imports       match state, rules, tunables, seeded RNG
  cpu/         pure TypeScript                      the opponent, drives the engine API
  sim/         node script                          runs cpu vs cpu, prints reports
  ui/          React                                screens, card component, race view
  protocol/    pure TypeScript                     the online messages, shared with the server
  server/      pure TypeScript                     the room: validates and applies actions
server/        Cloudflare Worker                   one Durable Object per room, WebSockets
counter/       Cloudflare Worker                   the matches-played count
```

**Engine API shape**

- `createMatch(config, seed) → MatchState`
- `legalActions(state, player) → Action[]`
- `apply(state, action) → MatchState`, immutable, returns a new state
- `isOver(state) → winner | null`

The engine is deterministic given a seed. Every rule in section 3 is a unit test. The UI and the CPU only ever call this API, and so does the room service: online play moved the engine behind a server without rewriting it (section 13).

**Race-end moment**: derived from the log, not from the engine's phase. When a newly applied state adds a `raceEnd` entry, the match screen keeps a record of the finishing positions and the captured car, freezes the track on it, and holds the CPU and the hand-over until Continue clears it. The engine moves to staging in the same step as before; only the screen waits.

**Persistence**: custom garages and decks in `localStorage`, wrapped in try/catch, with starters always available. The collection and its unopened packs sit next to them under their own key, through the same wrapper (section 12).

**Matches-played counter**: the one number that lives outside the browser. A Cloudflare Worker in `counter/` keeps a count in KV, answers GET with it, and adds one on POST from the game's origin, at most once every ten seconds per address. The site reads the worker URL from `VITE_COUNTER_URL` at build time; without it the counter is silent. One increment per finished match, sent from the client when the result screen appears, so abandoned matches do not count. KV writes are not atomic, and a lost count now and then is accepted. The count shows as one muted line at the bottom of the start screen and nowhere else.

**Rules in the game**: a native dialog, opened from the start screen, the board header, and the deck builder header, with the rules written as a walkthrough in seven short sections, in the order a first match asks for things, for readers from about age nine up, with sentences under twenty words and under 500 words in all, whose numbers come from `src/engine/tunables.ts` and whose wording matches the prompts on the board.

**Stack**: TypeScript, React, Vite, Vitest. Deployed as a static site to GitHub Pages.

---

## 10. Scope

**v1**

- 52 cars at v1, 102 after the roster expansion; 32 mods; 3 starter garages
- CPU, hotseat, and online play
- Every card unlocked (until phase 11 added packs and a collection; see section 12)
- Deck builder with saved garages
- Simulator and tuned numbers
- Live URL

**Post-v1, in likely order** (phases 10 to 15 in `BUILD_PLAN.md`)

1. Illustrated card art in one consistent style (phase 10)
2. Packs and a collection, with holo and foil variants (phases 11 and 12)
3. CPU difficulty levels (phase 13)
4. Online play: rooms by link or code (phase 14), then accounts, ranked matchmaking, and a leaderboard (phase 15); both done

---

## 11. Legal

Code is MIT licensed. Car names and marques are trademarks of their respective manufacturers. This project is unaffiliated with and not endorsed by any of them. The README carries the same note.

---

## 12. Collection and packs

Added in phase 11. Before it, every card was unlocked.

- The collection is per browser, in `localStorage` next to the garages, through the same try/catch wrapper. It holds a count per card id, cars and mods alike.
- A fresh browser owns every card in the three starter garages, with as many copies of a mod as the starter deck that uses it most, so the starters always rebuild. Everything else has to be opened: 46 of the 84 cards are owned at the start.
- Finishing a match against the CPU or an online opponent earns 1 pack; winning it earns 2. A hotseat match earns 1. Packs wait in a stack until opened, either from the pop-up that follows the winner banner and the result screen right after a match, or from the Collection screen, which shows every card, owned ones in color with their counts, unowned ones dimmed.
- A pack holds 2 cars and 3 mods. Car odds follow the tier's rarity label: Common 55%, Uncommon 30%, Rare 12%, Ultra Rare 3%. Mods are uniform across all 32. Duplicates count.
- The deck builder adds only owned cards: a car needs one copy, and a mod can go in up to the smaller of 3 and the copies owned. Its messages say what is missing. Racing is untouched: the engine's match config is card ids only, and a saved garage stays raceable.
- Migration: the first load after phase 11 grants every card in an already saved garage, once. The grant is written back at once, so it never repeats.
- Pack opening runs through the engine's seeded generator with a fresh seed per pack, so it is testable and the simulator can measure it.
- The odds and rewards are tunables under `collection` in `src/engine/tunables.ts`; a change gets a balance-log line.

**Measured** (`npm run sim -- --packs 10000`, seed 1): from the starter set, owning every card takes a mean of 395 packs (median 355) with the 52-car roster, and a mean of 611 packs (median 561) after the roster grew to 102 cars and 134 cards. The first pack holding an Ultra Rare car arrives after a mean of 16.7 packs (median 12). At one or two packs a match, new cards arrive from the first match on and a full collection is a long-term goal, with the last Ultra Rare cars as the chase. The Ultra Rare odds and the pack size are the levers if that proves too slow.

**Finishes** (phase 12). Every card pulled from a pack rolls a finish: 2% holo, 10% foil, the rest base. Both are cosmetic only. Foil is a shimmer on the frame; holo is a shimmer across the image area and is the rarer of the two. The collection counts foil and holo copies separately from the total, so a foil copy still counts toward ownership and deck limits. The best finish a player owns is the one that shows: in the collection, the builder, the player's own cards on the board, and the result screen; the CPU's cards stay plain. The treatment is CSS only, moves on hover, stays still under reduced-motion settings, and never touches the engine: match configs and match state carry card ids only. The pack reveal marks a foil or holo when one appears, and every card with a finish carries a small Foil or Holo tag.

---

## 13. Online play

**Shape** (phase 14). The room service is the only holder of a match. A client never runs the engine forward: it sends an `Action` and draws whatever view comes back. `redact(state, viewer)` in `src/engine/` makes the view. The viewer's own hand and garage stay as they are; the opponent's hand and both decks are replaced by `?` placeholders of the right length; the viewer's own deck is sorted so draw order never leaks; the random state is zeroed so the future cannot be simulated; the log stays, since it never carried hidden card ids. A view has the shape of a `MatchState`, so the board and the legality helpers run on it unchanged, and the legal actions from a view equal the legal actions from the full state.

**Protocol** (`src/protocol/messages.ts`, shared by the service and the client). Plain JSON over one WebSocket per client. Client to server: `join {name, garage}`, `resume {token}`, `act {action}`. Server to client: `welcome {code, seat, token}`, `waiting`, `state {view, names}`, `presence {opponentConnected}`, `error {reason}`. Every inbound message is shape-checked before the room sees it, and the room checks the seat, the turn, and `isLegal` before `apply`. A rejected message changes nothing and answers with a reason.

**Rooms** (`src/server/room.ts`). One room per match, reached by a six-character code from an alphabet without look-alikes (no 0, O, 1, or I). The first joiner takes seat 0, the second seat 1, and the match starts with the room's seed the moment both are seated. Each seat gets a reconnect token; a socket that presents it takes the seat back and gets the current view, so a refresh or a dropped connection costs nothing. The room is a plain class with no platform code, rebuilt from its snapshot at any time; the adapter persists the snapshot and owns the sockets.

**Hosting**. A Cloudflare Worker in `server/` with one Durable Object per room, SQLite-backed, on the free plan. The worker answers `GET /new` with a fresh code and upgrades `GET /room/:code` to a WebSocket, which the object accepts with the hibernation API, so an idle room costs nothing between moves. The object writes the room snapshot to its storage after every message and forgets the room a day after the last one. Only the site's origin and the local dev server may connect. The service lives at `https://pink-slips-rooms.pink-slips-counter.workers.dev`; the site reads it from `VITE_ROOM_URL` at build time, and without it the online button does not appear.

**Client** (`src/ui/online.ts`, `OnlineScreen.tsx`, `OnlineMatch.tsx`). The online screen makes a room or joins by code, and a shared `?room=` link opens it with the code filled in. The seat's code and token are kept in `localStorage` under `pink-slips.online.v1` until the match ends, and the online screen offers to rejoin while they are there. The client reconnects on its own with a doubling wait from one to ten seconds and resumes with its token. The race-end moment works as in section 9, with one difference: views that arrive while the banner is up are held and applied on Continue. An online match earns packs by the CPU rule, one for playing and two for a win, and counts once on the matches-played counter, reported by seat 0. CPU and hotseat play are unchanged and work offline.


**Accounts and matchmaking** (phase 15). A player is made from a name alone. The game's audience is kids, teens, and adults, most of whom have no account with any sign-in provider, so there is no provider: `POST /auth/player` with a name makes the account on the service and answers with a session token and a recovery code, and the browser is signed in from that moment. The code is twelve characters from the room-code alphabet, shown once as three groups of four and kept only as a hash; `POST /auth/recover` with the code opens a session for the same player on another device, and `POST /me/recovery` issues a new code and retires the old one. Sessions last a year from their last use and renew themselves once a day, so a player who never wrote the code down is not signed out by time; `POST /auth/logout` ends one. A cleared browser without the code loses the player, which the code view says plainly, and making several players is easy, which is accepted for a game of this size. The worker allows five new players an hour from one address. The site stores the token under `pink-slips.session.v1`.

The accounts live in one Durable Object, `AccountDirectory`, behind a platform-free `Directory` class in `src/server/directory.ts`: one record per account with its provider identity, display name, rating, record, collection, saved garages, and sessions. A signed-in browser keeps a mirror of the account's collection and garages in `localStorage`, so every screen reads as before, and asks the service whenever something changes: the builder pushes garages with `PUT /me/garages`, the collection and the pack pop-up open packs with `POST /me/packs/open`, and a finished CPU or hotseat match reports itself with `POST /me/cpu-result`, which the service honours at most once a minute. Guest data is claimed once, on the first sign-in from a browser: card counts take the larger of the two copies, packs add up, garages are kept, and the account is marked claimed so nothing is ever merged twice. Nothing a client sends can set a pack count or a rating.

Packs earned online are awarded by the server. A room learns the account behind each seat, from the ticket in a ranked room and from the session on the socket in a friend room, and when the match ends it reports the winner and loser to the directory once. The directory adds the packs by the online rule and, for a ranked match between two accounts, moves both ratings and records; the room then sends each seat a `result` message with its packs and rating change, and the client refreshes its mirror before the pack pop-up opens. A guest seat gets no packs from the server and keeps the local rule.

Ratings are Elo with K of 32 from a start of 1000, whole numbers, applied only to ranked matches: 1000 beating 1000 gives 1016 and 984, and 1000 beating 1200 gives 1024 and 1176. Matchmaking is a queue of sockets on the directory object, one per waiting account: `GET /queue` with the session upgrades to a socket, and the object pairs the two longest-waiting players. Once more than 50 accounts hold a rating, two players who have both waited under 30 seconds are paired only when their ratings are within 200 points; anyone who has waited longer takes the next player. The pair gets a fresh room set up with one ticket per seat, a `matched` message with the code and ticket, and the room seats only the ticket holders, naming them from their accounts. A queue tick runs every five seconds while anyone waits. The numbers live under `online` in `src/engine/tunables.ts`.

The profile screen shows the name, rating, record, cards owned, and packs waiting, with the leaderboard below: the top 50 accounts with at least one ranked match, by rating. A socket upgrade with no `Origin` header at all comes from a script rather than a page, and is allowed; any other site's origin is refused. That admits `scripts/online-smoke.ts`, which makes two players, queues them, plays the match, and checks that both ratings moved, against any deployment.

**Not yet**: spectators, a rematch inside the same room, trading, a filter on player names, and linking an outside sign-in as a second way to recover a player.
