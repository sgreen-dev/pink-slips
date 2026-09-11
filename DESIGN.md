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
| **Loaner garage** | One of the three prebuilt garages. Always raceable, never owned. |
| **Intro set** | The cards a fresh collection owns. The floor a lap returns to. |
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

**Data fields**: `id`, `name`, `make`, `model`, `generation` (only when needed to disambiguate), `imageUrl` (the card illustration; every car has one). Where the figures came from is `source`, which lives with the drivetrain, engine, production years and tier note in `carDetails.ts` keyed by car id, since only the detail panel reads any of them (backlog P3).

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

- Heavy types top out low. Off-road and JDM have no Hyper cars, and Off-road has only three Super cars.
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

126 cars. The 30 marked ★ were requested by name and are fixed. The other 22 of the first 52 were fillers chosen to give every cell at least one car where a real car exists for it, and 50 more were added afterwards to bring every type to 17, with tiers split 5, 5, 4, 3 where real cars exist and spread across each band; JDM and Off-road have no Ultra Rare car. The last 24, four per type, were chosen for recognition rather than to fill cells: the cars most people know on sight, from the DeLorean and the DB5 to the Cybertruck. Specs below are the approximate figures the roster was chosen with. The verified figures, with a source per car, live in `src/data/cars.ts`; where a manufacturer publishes only a dry weight, that is what is used and the source says so.

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
| Daily | DeLorean DMC-12 (1981) | 130 | 2,712 |
| Super | Porsche 911 GT3 (992.1) | 502 | 3,164 |
| Super | Ferrari F40 | 471 | 2,765 |
| Hyper | Bugatti Chiron | 1,479 | 4,398 |

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
| Daily | Cadillac Escalade (2021) | 420 | 5,635 |
| Performance | BMW M3 Competition (G80) | 503 | 3,890 |
| Performance | Rolls-Royce Phantom (VIII) | 563 | 5,644 |
| Performance | Aston Martin DB5 | 282 | 3,236 |

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
| Super | Dodge Challenger SRT Hellcat Redeye | 797 | 4,451 |
| Hyper | Chevrolet Corvette ZR1 (C8) | 1,064 | 3,800 |
| Daily | Ford Mustang 200 Six (1965) | 120 | 2,445 |
| Daily | Ford Mustang V6 (2005) | 210 | 3,300 |
| Daily | Dodge Challenger SXT | 305 | 3,894 |
| Performance | Ford Mustang Mach 1 (2021) | 480 | 3,868 |
| Super | Dodge Challenger SRT Hellcat | 717 | 4,449 |
| Super | Ford Shelby GT500 (2020) | 760 | 4,171 |
| Hyper | Chevrolet Corvette ZR1 (C7) | 755 | 3,560 |
| Daily | Pontiac Firebird Trans Am (1977) | 200 | 3,650 |
| Performance | Dodge Charger R/T (1969) | 375 | 3,900 |
| Performance | Chevrolet Corvette Stingray (C8) | 490 | 3,535 |
| Super | Dodge Charger SRT Hellcat | 707 | 4,575 |

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
| Daily | Toyota Corolla GT-S (AE86) | 112 | 2,200 |
| Performance | Toyota Supra Turbo (A80) | 320 | 3,415 |
| Performance | Nissan Skyline GT-R (R34) | 276 | 3,439 |
| Performance | Nissan 350Z (Z33) | 287 | 3,188 |

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
| Performance | Tesla Model Y | 384 | 4,363 |
| Performance | Tesla Cybertruck Cyberbeast | 845 | 6,843 |
| Performance | GMC Hummer EV Pickup | 1,000 | 9,063 |
| Performance | Ford Mustang Mach-E GT | 480 | 4,997 |

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
| Daily | Ford Bronco Wildtrak (2021) | 330 | 4,850 |
| Daily | Land Rover Defender 110 (L663) | 395 | 5,165 |
| Performance | Ford F-150 XLT (2021) | 400 | 4,705 |
| Performance | Range Rover (L460) | 523 | 5,699 |

### 2.5 Mod cards

**Families**

| Family | Timing | Target | Limit |
|---|---|---|---|
| **Part** | attaches permanently | your car, any in garage | open slots on that car (2, JDM 3) |
| **Boost** | one-shot, discarded | your staged car or your turn | one per turn |
| **Sabotage: Traction** | one-shot, discarded | opponent's staged car's next advance | one Sabotage per turn |
| **Sabotage: Pit** | one-shot, discarded | opponent's staged car's fuel, parts, or wear | one Sabotage per turn |

Boosts outnumber Sabotage roughly three to one. A few mods are type-locked and say so on the card. Some Boosts cost fuel to play, which is removed from the staged car when played, so fuel above the car's cost has a use.

**Rarity and levels**: a mod is common unless the data marks it rare. A rare mod is capped where it matters: a deck holds at most one copy of it instead of three, and a mod slot in a pack holds a rare mod only 5% of the time, uniform among the rare mods, so it stays scarce even in a large collection. A level-2 mod is an upgraded version of a base mod, always rare, and its card names the base it upgrades. Fuel Drain, level 2 of Fuel Siphon, is the first; others can follow the same shape when a base effect deserves a stronger, scarcer copy. The card shows a gold Rare tag.

**Mod set** (33 cards, all values tunable)

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
| Fuel Drain | remove 2 fuel from the opponent's staged car. Rare; level 2 of Fuel Siphon |
| Parts Thief | discard one Part from the opponent's staged car, their choice |
| Roadblock | opponent cannot play a Boost on their next turn |
| Bad Tune | opponent's staged car gains 1 wear |

---

## 3. Match rules

### 3.1 Setup

1. Each player brings a garage of exactly 5 cars and a mod deck of 30 cards. Max 3 copies of any mod, 1 of a rare mod.
2. Garages are face up for the whole match, including fuel, parts, and wear on every car. Hands are hidden.
3. Each player shuffles their mod deck and draws 5.
4. Coin flip decides who goes first.
5. Each player stages one car from their garage, the first player choosing first. Both staged cars start at 0 ft. Staging is in turn and in the open, not simultaneous: whoever stages second sees what they are racing, which is an edge the Pro CPU is built to use (section 6) and a hotseat player gets in the same way.

### 3.2 Turn

Players alternate. A turn has four steps in this order.

1. **Draw** one card. If the deck is empty, shuffle the discard pile into the deck first. There is no loss for running out.
2. **Fuel**: place one fuel token on any car in your garage, staged or not.
3. **Mods**: play any number of Parts into open slots on any of your cars, at most one Boost, and at most one Sabotage.
4. **Advance**: if your staged car has fuel at or above its fuel cost, it advances. See 3.3.

The first player skips the Advance step on their first turn.

A mod played this turn can be taken back until the mod step ends or the player advances, in every mode. The take-back restores the state from before the play exactly, card, fuel, parts, and log included; it is a convenience of the screens and the room, not an engine action.

### 3.3 Advance

Computed in this order. All results floor to whole feet, minimum 0.

1. Effective hp = `hp × (1 + sum of percentage hp modifiers from Parts and Boosts)`
2. Effective weight = `weightLb − sum of weight reductions`
3. Base = `floor(K × effective hp × type multiplier ÷ effective weight)` where **K = 3000** (tunable) and the type multiplier is 1 for Sports, Muscle, and EV, 1.1 for Luxury, 1.2 for JDM, and 1.17 for Off-road (tunable, set in phase 5; Off-road came down from 1.2 in phase 50)
4. Add flat bonuses: type identity, Parts, Boosts
5. Apply Sabotage pending on this car: flat reductions first, then halving
6. Apply wear: `× max(wearFloor, 1 − wearRate × wearCount)` where **wearRate = 0.10** and **wearFloor = 0.10** (both tunable). Luxury uses half the rate. The floor keeps a worn car moving: however much wear it carries, it covers a tenth of its distance, so wear can slow a race but never stop one.
7. If the car's distance reaches or passes **1320 ft**, the race ends immediately.

Three details the seven steps above leave out, which the code fixes and a reader should not have to infer. A Boost that multiplies the advance, which is Redline, applies after the flat bonuses of step 4 and before the Sabotage of step 5, so a halving cuts the boosted number. Overdrive's second advance is a fraction applied after the wear of step 6, not before it. And that second advance carries the car's Part and type-identity bonuses but not the Boosts already spent on the turn, since a Boost is spent once. Effective weight is also floored at 1 lb, so weight reductions can never divide by zero.

Worked example at K = 3000, no mods, using the verified figures in `src/data/cars.ts`: Civic Si (200 hp, 2,952 lb, JDM ×1.2) advances 243 ft and needs 6 advances. Mustang GT (460 hp, 3,705 lb) advances 372 ft and needs 4. Aventador SVJ (759 hp, 3,362 lb dry) advances 677 ft and needs 2. Rimac Nevera (1,914 hp, 5,071 lb) advances 1,132 ft and needs 2.

### 3.4 Race end

1. The winning player takes the losing car as a **pink slip** into their prize pile. Its fuel and parts are discarded.
2. The winning car gains **1 wear**.
3. Both players may stage any car from their garage, the loser first, since their staged slot is empty and the winner may keep the car they have. As at setup this is in turn and in the open, so the winner chooses knowing what they face. The winner may keep the same car or swap for free. Wear, fuel, and parts stay on the car they are on.
4. Both staged cars reset to 0 ft. Pending sabotage is cleared.
5. Play continues with the next turn in normal alternation.

### 3.5 Match end

A player holding **3 pink slips** wins immediately. Garages of 5 and a win at 3 mean a garage can never empty first.

A player may concede at any point of a started match, on or off turn, and the other player wins it. A concede is a match result like any other: the log records it, and online it is reported for packs and, in a ranked match, ratings. Conceding is not an action the engine offers, so the CPU never does it; the screens and the room call it.

### 3.6 Coin flips

A coin flip is a 50/50 result from the engine's seeded random number generator, xoshiro128\*\* over a four-word state. The first player of a match is the winner of a coin flip, except in a rematch (section 13), where the room names the first player and no flip is made. The Sports type identity forces the first flip a Sports car makes each race to heads.

---

## 4. Tunables

Every value here is a starting point. Phase 5 runs the simulator and adjusts them against evidence. Values live in one file, `src/engine/tunables.ts`, and nothing else hardcodes them.

| Tunable | Start | Rationale |
|---|---|---|
| Track length | 1320 ft | a quarter mile, fixed by theme |
| K (advance constant) | 3000 | a Daily car finishes in about 6 advances, a Hyper in 2 or 3 |
| Fuel cost by tier | 1 / 2 / 4 / 6 | started at 1 / 2 / 3 / 5; phase 5 found the top two tiers needed a steeper step |
| Per-type distance multiplier | 1 / 1.1 / 1 / 1.2 / 1 / 1.17 (Sports, Luxury, Muscle, JDM, EV, Off-road) | phase 5 lever for the heavy and low-tier types; 1 everywhere to start; Off-road 1.2 to 1.17 in phase 50 |
| Wear rate | 10% per win | three wins cost a car nearly a third of its speed |
| Part slots | 2, JDM 3 | |
| Garage size | 5 | |
| Packs per match | 1, or 2 for beating the CPU or an online opponent | phase 11; a pack every match or two keeps packs frequent, and a full collection is a long goal (section 12) |
| Pack contents | 2 cars, 3 mods | phase 11 |
| Car tier odds in a pack | 55 / 30 / 12 / 3 (Common, Uncommon, Rare, Ultra Rare) | phase 11; rarity labels mean something |
| Foil and holo odds per pack card | 10% foil, 2% holo | phase 12; a foil most packs, a holo now and then |
| Rare mod odds per pack mod slot | 5% | rare mods stay rare |
| Pink slips to win | 3 | |
| Mod deck size | 30 | |
| Copies of a rare mod per deck | 1 | common mods stay at 3 |
| Hand size at start | 5 | |
| Draw per turn | 1 | |
| Copies of one mod | 3 | |
| Boosts per turn | 1 | |
| Sabotage per turn | 1 | |
| Type bonus magnitudes | as listed in 2.3 | EV launch bonus started at 100 ft; phase 5 cut it to 75 |
| Mod values | as listed in 2.5 | |

---

## 5. Loaner garages

Four prebuilt garages ship so a new player is racing within ten seconds. Each has a 30-card mod deck built for its style.

They are cut by **how you win**, not by car type (phase 45). Three of them were named for a kind of car, and the EV one had drifted to three EVs and two Off-road cars, which is what prompted the re-cut. A type garage teaches a player what an EV is; it does not teach them how to play. So each garage is now a way to take the match, each spans several types, and all six types appear across the twenty cars. The four decks between them run **every one of the 33 mods**, so the set is also a tour of the card pool: Redline and Fuel Drain had never appeared in a loaner deck before.

They are **loaners** (phase 28): always raceable and never owned. Their cards are not in the collection, they cannot be edited or broken, and a loaner car can be neither won nor lost under stakes. What a fresh collection owns is the smaller intro set in section 12, and the two moved apart so the garages could stay broad enough to teach the game while the collection stayed small enough to leave something to find. Before phase 28 the union of these three garages was the free grant.

**Random garages** (phase 44). A fourth way to race, beside the three loaners and whatever the player built: the game deals five cars from the whole roster and a thirty-card deck from every mod those cars can use. Like a loaner it is **always raceable and never owned**, and for the same reason it can never be played for stakes — its cars are ordinary roster cars, so a win would write cars into a collection that never opened them while the other side, owning none of it, lost nothing. It is dealt to **both** sides locally, so the match is symmetric, and to your seat alone online, where the other seat is a person who picks for themselves. Dealing again gives a fresh pair. It earns packs exactly as any other garage does, since a pack is for finishing a match and not for what was raced, and it cannot enter the rated queue, since a rating measures the garage a player built as well as how they play.

The draw is not a new question of balance: `randomGarage` against `randomGarage` is the *field* every target in section 7 is measured against, so a dealt match is the case the game is already tuned for. Type-locked mods are dealt only when the garage holds a car of that type, which is the one rule the builder merely warns about.

| Name | Style | Cars |
|---|---|---|
| **Street Kings** | race early and often | Mustang GT, Civic Si, RX-7, X5 M, 911 Carrera S |
| **The Long Game** | bank fuel, win late | 812 Competizione, AMG GT R, Model X Plaid, Raptor R, Miata |
| **Tuners** | the deck does the work | GR Supra 3.0, Civic Type R, Integra Type R, Corvette Stingray C8, Ioniq 5 N |
| **Spoilers** | slow the other side down | Charger SRT Hellcat, Supra Turbo A80, EV6 GT, Range Rover P530, Challenger SXT |

**Decklists** (30 cards each)

- **Street Kings**: Two-Step ×3, Perfect Launch ×3, Drag Slicks ×3, Power Shift ×3, Pit Crew ×3, Stage 2 Tune ×3, Turbo Kit ×3, Wheelspin ×2, Anti-Lag ×2, Red Light ×2, Roadblock ×2, Launch Control ×1
- **The Long Game**: Extra Tank ×3, Tow Truck ×3, Fuel Cell ×3, Regen ×3, Supercharger ×3, Nitrous Shot ×3, Roll Cage ×2, Aero Package ×2, Sponsor ×2, Fuel Siphon ×2, Missed Shift ×2, Fuel Dump ×1, Redline ×1
- **Tuners**: Turbo Kit ×3, Supercharger ×3, Weight Reduction ×3, Anti-Lag ×3, Sponsor ×3, Pit Crew ×3, Overdrive ×3, Stage 2 Tune ×2, Wheelie Bar ×2, Perfect Launch ×2, Power Shift ×2, Wheelspin ×1
- **Spoilers**: Carbon Body Kit ×3, Pit Crew ×3, Oil Slick ×2, Missed Shift ×2, Bad Tune ×2, Roadblock ×2, Wheelspin ×2, Weight Reduction ×2, Stage 2 Tune ×2, Launch Control ×2, Power Shift ×2, Perfect Launch ×2, Red Light ×1, Parts Thief ×1, Fuel Siphon ×1, Fuel Drain ×1

With the CPU on both sides each garage wins about half its matches overall — 50, 49, 51 and 50 at 40,000 matches on seed 1, re-taken in phase 50 after the CPU learned to judge a car by its race and Off-road's multiplier came down — and they beat each other in a cycle: Street Kings over The Long Game, The Long Game over Tuners, Tuners over Spoilers, Spoilers over Street Kings. Every link holds on seeds 1, 2 and 3, at 65/64/60, 59/58/59, 55/55/59 and 58/57/54, and the two pairings across the cycle are measured too: The Long Game and Spoilers stay near even, and Tuners edges Street Kings 55 to 56, so the cycle is a finding rather than an assumption.

The link that took the work was The Long Game over Tuners. Both are build-up strategies — bank fuel against bolt on Parts — so at first they raced past each other at 52, 50 and 49, which is level rather than a link. Giving The Long Game a Part-hate package was the obvious fix and made it worse: Parts Thief strips one Part where Missed Shift halves an entire advance, and the CPU prices them accordingly. Raising The Long Game's ceiling worked instead, which is why the 812 Competizione is there rather than the Aventador — it is Luxury, so the car the garage wins on also takes half wear, and that is what lets it out-scale a Tuners car once the Part slots are full.

Sabotage that stalls a first advance, Red Light above all, swings these matchups more than any Part or Boost. A garage built entirely on it is therefore the strongest thing in the game: Spoilers at twenty-two Sabotage cards took 89% off Street Kings and 70% off Tuners, and it ships at fifteen with one Red Light. Only one Sabotage may be played a turn, so past about half the deck the extra copies buy nothing anyway. The counter-weight is a single Launch Control in Street Kings — three of them was tried and closed the gap between the CPU levels instead, since a stall that is always shrugged off is one Pro gains nothing by timing.

---

## 6. CPU opponent

One rule-based opponent, used both in play and by the simulator. It never cheats: it sees only what a human would see. Priorities, in order:

1. If the staged car can win this advance with a Boost in hand, play it.
2. If the opponent's staged car would win on its next advance and a Sabotage in hand prevents that, play it.
3. Fuel placement: if the staged car is under its cost, fuel it. Otherwise fuel the garage car that covers the most ground per advance over a race, per fuel remaining.
4. Attach Parts to the car with the most races likely left in it.
5. Between races, stage the car that covers the most ground per advance over a race, preferring lower wear. A race is read advance by advance from where each one starts, so Muscle's top end counts past 660 ft and EV's launch counts once (phase 49).

When none of those applies, the CPU still uses its turn. It attaches any Part that improves a car. It plays a Boost worth at least 50 ft on an advance it will make this turn, counting fuel and cards a Boost gives as worth something too, and a Sabotage that takes at least 50 ft off an advance the opponent is ready to make. It never plays a Boost that would leave its staged car unable to advance. It reads every coin flip as tails unless the Sports rule makes heads certain, and assumes the opponent's hand is empty. Reading tails means a card whose worth is all on heads is worth nothing to it: Rookie and Street never play Overdrive, and never play Nitrous Shot except behind the Sports rule, so the Overdrives in the Tuners deck and the Nitrous Shots in The Long Game sit in the CPU's hand at two of the three levels. Pro reads flips at their expected value and plays both. Exact ties between equal choices are broken by a seed, so the CPU is deterministic given a state and a seed.

**Levels** (phase 13). Three levels, chosen at match start, default Street. *Rookie* fuels and stages by the rules above but never uses the win rule or the stop rule, spends a Boost or Sabotage only when it is worth twice the usual threshold, and stages by highest advance alone, ignoring fuel and wear. *Street* is the opponent described above, unchanged. *Pro* adds four things: it holds a first-advance stall such as Red Light until the opponent's staged car is fueled and about to make its first advance; it stages the car that finishes a race in the fewest turns with fueling counted, and when it stages second it takes the weakest car that still finishes first with a turn to spare, so a Hyper stays on the bench until it can move and the strong cars stay unworn; it reads coin flips at their expected value instead of as tails; and it values Boosts and Sabotage by the turns they take off its own finish or add to the opponent's rather than by feet, since in a turn-based race only the turn count decides. A rule that fueled only bench cars able to be ready by the end of the current race was tried and dropped: it starved Hypers of fuel and cost Pro matches. A level is a profile of switches the CPU reads and the engine never sees. Rookie cannot play for stakes (section 12).

**Measured** (`npm run sim -- --levels`, 4,000 matches per pairing, seed 1, re-taken in phase 49 after the CPU started judging a car by its whole race): over random garages Street beats Rookie 72% and Pro beats Rookie 75%, while Pro and Street split evenly, where they split 52 to 48 before, so on arbitrary garages Street plays at the ceiling of this rule set. Over the starter pairings, the garages a new player races, Pro beats Street 58%, Street beats Rookie 67%, and Pro beats Rookie 71%. Every level takes under 0.02 ms per action. The next real step up for Pro would be a one-turn lookahead through the engine rather than more rules.

Those starter figures fell when the loaner garages were re-cut by strategy in phase 45, from 61/75/83, and the cause is the garages rather than the rules: over random garages the numbers are unchanged. Rookie's weakness is that it stages the highest-advance car and ignores what filling it costs, so only a garage holding something expensive punishes it. The old three had two of those; four strategy garages have one, because both *race early and often* and *slow the other side down* want cheap cars. The margin is also seed-sensitive — `src/cpu/levels.test.ts` reads Street over Rookie at 60% on its own seed, at both 2,000 and 6,000 matches, and its floor moved from 65 to 60 to match. Putting a second expensive garage back would lift it and cost the cycle in section 5; that trade was made deliberately in favour of the cycle.

The Pro-over-Street floor moved the same way and for the same reason, from 60 to 58, when the loaners were tuned until every cycle link held (phase 46). Four garages built to counter each other decide more of a match between them, and leave less to be decided by how well they are played. Six ways of recovering it were measured and each broke a link or made it worse; coin-flip cards were among them, and they *lower* the gap rather than raise it, because a card Street never plays thins the deck it draws from more than holding it costs. It moved again in phase 49, from 58 to 56, when Street learned to judge a car by its whole race. Street had been staging slow EVs for a launch bonus it counted on every advance and passing over Muscle's top end; playing better cost Pro about two points over the starter garages, 57.5% to 55.4% across seeds 13 to 17 and 58.4% to 56.6% on the test's own seed. Only two of those five seeds cleared 58 before the change.

---

## 7. Simulator

A headless command, `npm run sim`, that plays CPU against CPU for thousands of matches with a fixed seed and prints a report. It exists so balance is argued from evidence.

**Reports**

- Win rate by garage type composition and by tier composition
- Win rate by car type with the tiers held equal, and with the Pro CPU (the type lab, below)
- Win rate of the player who goes first, which a coin flip decides and a rematch alternates
- The weakest tier as well as the strongest, since a cap says nothing about a band nobody can win with
- Average match length in turns per player, and distribution
- Mod play rates and win rate when played
- Race outcomes by tier matchup

**Starting targets** (tunable)

- Every single-type garage wins between 45% and 55% against the field, checked by the type lab over 10,000 games a type (phase 48; it was a 60% cap on the highest type)
- No single-tier garage wins more than 65% against the field
- A Daily-only garage against a Hyper-only garage lands between 35% and 65%
- Median match is 25 or fewer turns per player
- The first player wins between 47% and 55%
- No single-tier garage wins less than 20% against the field (added in phase 43; not met yet, see backlog G5)

All six live under `sim` in `src/engine/tunables.ts`.

**Type lab** (phase 48, `npm run sim:types`, about three minutes). The default run reads each type over about a thousand games, three points either way, with the tiers of its cars left to chance: enough for a 60% cap, too loose for a band. The lab plays each type 10,000 times against the field, one point either way, with the type moving first in exactly half its games, and adds two readings that say where a result comes from. *Same tiers*: both garages hold the same five tiers, drawn from the tiers every type has cars in (so no Hyper), one side all of the type; it reads the type's own rules and cars, and the gap to the field reading is what its tier mix is worth. *Pro*: the field reading with the Pro CPU on both sides, which stages by the turns a car needs to finish, fueling included; a Pro reading outside the band is reported as a warning rather than a failure, since it says the type's balance depends on how its cars are staged (backlog G22). A type passes when its reading is inside the band, and the report marks it close when its range crosses an edge.

Baseline (field reading at seeds 1 and 2; same tiers and Pro at seed 1): Sports 54.9 / 56.1, same tiers 49.0, Pro 46.4. Luxury 51.5 / 50.9, 51.6, 51.1. Muscle 52.1 / 52.6, 52.7, 49.8. JDM 49.1 / 49.4, 51.5, 45.2. EV 46.4 / 46.2, 36.7, 48.0. Off-road 56.0 / 56.4, 64.8, 67.1. Off-road is over the band on both seeds and Sports on the second. Off-road's rules and cars are the strongest for their tier by far, and only its cheap tiers keep its field reading down. Sports is the reverse: strong through its tier mix, and through the way the Street CPU stages its cars, which is why it drops 9 points under Pro (backlog G22). EV's cars below Hyper are the weakest for their tier. The six types average 51.7%, not 50, so the band's top edge is the one that binds. The intro set reads 44.4% and 46.9% against the field on the two seeds.

With the CPU judging cars by the whole race (phase 49) the field readings are Sports 54.2 / 55.0, Luxury 50.8 / 50.4, Muscle 50.3 / 50.7, JDM 48.8 / 48.7, EV 48.7 / 48.8, Off-road 55.0 / 55.9. The spread closes from about ten points to seven, EV and Muscle move toward the middle, and Muscle reads the same under Pro as under Street. The intro set reads 44.2 / 45.4. Sports and Off-road still read about 8 and 11 points apart under Pro, which the race estimate does not touch.

Tuned in phase 50: Off-road's multiplier came down from 1.2 to 1.17, the smallest step that brought it inside the band on both seeds (1.15 read 50%, 1.12 read 47%, 1.1 read 44%). The field readings are Sports 55.1 / 55.9, Luxury 51.6 / 50.9, Muscle 50.9 / 51.4, JDM 49.3 / 49.1, EV 49.2 / 49.4, Off-road 52.2 / 52.7, and the intro set 43.9 / 45.7. Five types sit inside the band on both seeds. Sports sits just over it, and only under the Street CPU. The first explanation, that Street reads every coin flip as tails except the one the Sports rule makes heads, was wrong: giving Street each of Pro's skills on its own showed that reading flips at their odds moves Sports about 2 points, while staging by the turns a car needs to finish moves it 7. Under Pro, which stages that way, Sports reads 46 to 47, so trimming it would make it weak for anyone who stages that way; it stays at 1.

**Careful staging** (backlog G22). Pro stages the car that needs the fewest turns to finish, fueling included; Street stages the one that goes furthest. On random garages the two split evenly, so neither is simply the better play, but they balance the game very differently. With Pro on both sides (40,000 matches, seeds 1 to 3) Off-road wins 63 to 64% against the field and Sports 47 to 49; single-tier garages run Common 7, Uncommon 61, Rare 46, Ultra Rare 27, where Street runs 3 / 53 / 63 / 42; the first player wins 58%, outside its band; the loaner cycle breaks, with Tuners taking 84% off Spoilers and The Long Game 66% off Street Kings; and the intro set beats every loaner, 56 to 82%. Counting fueling turns favours cheap, efficient cars, so the tier curve of G5 and this are likely one question: how fueling turns trade against speed. Six fuel costs per tier were tried, and none brought Off-road below about 59% with Pro; the one that came closest took Sports to 59% with Street. The targets stay with Street, the CPU most matches are played against, and the type lab reports a Pro reading outside the band as a warning until real players show which way they stage.

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
- **A card is an object, not a rectangle.** It is lit from above: two cast shadows, a tight contact one and a wider ambient one, with the frame's top edge lit and its bottom edge shaded so the border reads as the thickness of the stock, and the cream face seated into it rather than printed on it. Under a real pointer the card leans up to 7° toward the cursor, and a finish's shimmer and a specular highlight both go where the pointer is, so the light agrees with the lean. Every number is in `em`, so the treatment scales with the card and is the same object in the dealt row as in the detail panel. The lean is absent on touch, where there is no pointer, and under reduced-motion settings, which keep the lighting and drop the movement. It costs the collection nothing at rest: the lean exists only on the one card being pointed at, which matters at the 126 the grid mounts at once.
- Typography served from the site itself (backlog P6): a condensed display face for names, a monospace face for stats. Real fallback stacks. Five roles in all, since the wordmark and the on-screen distance each want a face the other four cannot give them.
- Race screen: two lanes viewed from above, a car marker per lane advancing toward a finish line, distance in feet under each. Markers slide. The one other piece of motion is the race-end moment: the track holds at the finishing positions, the winner's finish line flashes, and a banner names the winner and shows the captured car as a pink slip with the tally, and one line on what taking it means: without stakes the car is out for the rest of the match, and with them it changes hands for real at the end unless it is a loaner car or a keepsake (backlog U38). It stays until Continue and comes before staging, the hotseat hand-over, and the result screen. Reduced-motion settings keep the banner and drop the motion.
- Hotseat shows a hand-over screen between turns so hands stay hidden.
- Desktop first. Usable on a phone.
- Palette and type choices are made in phase 6 and recorded here.

**Palette and type** (phase 6)

| Role | Value |
|---|---|
| Table | asphalt `#17171a`, panels `#232327`, a panel lifted for a toggle that is on `#2b2b31`, lines `#3a3a40` |
| Card stock | cream `#f3e7c9`, stat bands `#e6d7b0`, ink `#2b2118` |
| Accent | pink `#ff5ca8` for pink slips, prompts, and targets; gold `#f2c14e` for the staged car, fuel, and the distance on the track |
| Type borders | Sports `#d7263d`, Luxury `#7a3e9d`, Muscle `#e8731c`, JDM `#1e6fd9`, EV `#1fa37a`, Off-road `#8c6b2f` |
| Mod families | Part `#6b7f99`, Boost `#2e9e5b`, Sabotage `#c0392b` |
| Wordmark face | Monoton, a neon-tube face, for the start title only; falling back to Bebas Neue, Impact |
| Display face | Saira Condensed, falling back to Oswald, Arial Narrow |
| Stat face | Space Mono, falling back to IBM Plex Mono, Courier New |
| Meter face | Wallpoet, for a distance on screen; falling back to Space Mono, Courier New |
| Body face | Barlow, falling back to the system UI stack |

**Card art** (phase 10)

Every car card carries an illustration in one style: the owner's own, imported from `game-images/cars/` by `scripts/art/import_art.py` and given the same print treatment so it sits beside the rest, or one derived from a photograph on Wikimedia Commons by the pipeline in `scripts/art/`. The credits file marks which is which. The spec: an 800 by 600 image for the 4:3 art box; a front three-quarter view with the car facing right, the direction the track runs, mirrored when the source faces left; the car cut out of its background, posterized to eight tones with a printed line layer, and set on the card cream `#f3e7c9` with a soft shadow; WebP under 60 KB each and under 4 MB in total. Source photographs must be CC0, public domain, CC BY, or CC BY-SA, and each is credited in `public/art/CREDITS.md`. The illustrations are published under CC BY-SA 4.0. The tinted silhouette stays as the fallback while an image loads or if it fails.

Fonts are served from the site itself (backlog P6): `npm run fonts` fetches every face and subset exactly as Google serves them into `src/fonts/`, with each family's licence, and writes `src/fonts.css`, so a visit asks no one else for anything. The wordmark and the meter are cut to the glyphs of the one fixed string each sets, which means changing the title also means changing `WORDMARK` in `scripts/fonts.ts` and running it again. The display face has a lowercase where Bebas Neue had none, so the all-caps look is set in CSS rather than left to the typeface. The card is a portrait 5:7 with a thick type-colored frame, a cream body, the name across the top in the display face, a boxed image area holding a tinted silhouette, a striped stat block in the mono face, and tier and fuel cost along the bottom. Fuel, wear, parts, and Launch Control show as tokens on the frame below the body. The engine defines every interaction: a card lights up pink only when `legalActions` lists a play for it.

---

**Start backdrop**: the start screen shows the owner's neon road scene edge to edge, served as WebP from `public/backgrounds/`, under a dark wash that runs from about 55 percent at the top to 85 percent at the bottom so the title reads over the sun and the garage pickers sit on the dark road. The collection, builder, online, profile and result screens have their own; the match board reuses the start screen's scene under a much heavier wash, since it is the densest screen in the game and nothing should compete with a card.

**Stakes toggle**: in CPU mode the start screen shows "Play for stakes" under the levels with one line on what it means, disabled at Rookie with the reason; the online screen shows the same toggle to a signed-in player above the ranked and friend sections, with a note that both players need it on. The result screen's Stakes block follows the packs line.

**Next-step cue**: on the player's own turn the prompt line turns gold and breathes, and the button that moves the turn on (End mod step, Advance, a Parts Thief pick, a Sponsor fetch, and Continue at the line) breathes a gold ring in the same rhythm as the target cards, so the next step is obvious at a glance; while the other player acts, nothing breathes. Under reduced motion the gold stays and the motion stops.

**Button order** (phase 31): the board is the model every other screen follows. One forward action, marked primary, first; recovery and destructive actions plainer and last; a prompt above them; never many controls at once. Six rules hold across the game.

- **One primary per panel.** `button--primary` marks the action a panel exists for and nothing else. A tab, a filter chip or a level that is on wears `button--on`, so the selected state of a toggle never looks like the main action.
- **Routine before rare, safe before destructive.** The thing done most often leads. Anything irreversible sits last, in its own bordered panel: the collection screen runs Open a pack, then scrap and buy, then the lap.
- **A destructive action confirms on a different button than the one that armed it**, so a second click on the same spot cannot destroy anything. Arming swaps in a pair, a short question, then the way out, then the confirming button, in that order, so the spot the arming button stood on is covered by the way out and never by the destruction: builder Delete and Start empty, collection Scrap and Take the lap, board Exit match, online Leave, profile Sign out.
- **A panel's controls line up with the section around them**, and sibling panels agree with each other.
- **A picker and the button that acts on it share a row**, so the choice and the act read as one control.
- **Every screen header is the same header.** The brand on the left with the screen's title beside or beneath it, and on the right the two ways off the screen stacked, Back to start above Rules. The deck builder, the online screen and the profile centre their title; the collection tucks its title under the brand. The board is that header with the turn summary in the middle and the speaker in the stack, and its three controls are pinned to the right edge rather than spaced by a summary whose length changes every turn. On the start screen, which has no header, what leaves it sits in its own row below the main action and the utilities in a second row below that, not inside a group of modes, so a screen reader is never told the speaker is a way to play.


**Button form** (phase 47): *Button order* above says which button leads and in what order; this says what one looks like, which until now was never written down and so drifted. Three rules.

- **Three sizes, chosen by the row's job and never by the container it sits in.** `button--big` is a screen's one decision, and every button in that row is big. The default size is an action or a destination in the flow of a screen. `button--small` is a chip, a screen-header control, or a button inside a line of prose. **One row is one size**, and a confirm pair takes the size of the row it covers.
- **Four backgrounds, chosen by what pressing it does.** `button--primary` is the one action a panel exists for, and while a destructive pair is armed the confirm is that one, so the panel's usual main action goes plain for the moment. A solid ground means the button does something: navigates, saves, buys, confirms, cancels or arms. `button--ghost` is only a button that opens or dismisses a panel of words and changes nothing — Rules, Privacy, Credits, the speaker, and a callout's OK, seven in the whole game. `button--on` is a toggle that is on.
- **A row of buttons is spaced `0.4rem`**, or `1rem` when the row is big buttons or when the gap is separating groups rather than buttons. A control and the button that acts on it keep `0.5rem`, since they are one control and not a row.

The class order is `button`, then the look, then the size: `button button--ghost button--small`, never the other way about.

**The gold ring** (backlog U40). The next step wears a gold ring that swells and settles, `button--next`. `button--attention` wears the same ring on a button that is not the next step but is easy to miss, which today is only Scrap while spare cards wait, and the ring goes as soon as the player answers it. Either is written last, after the look and the size, and under Reduce Motion the ring stays and stops moving. A chosen garage in the picker keeps its pink frame and its name glows the same gold, still rather than breathing, since a choice already made is not a step waiting to be taken (backlog U41).

**Mod hints**: during the player's own mod step a faded card in the hand says in one line why it cannot be played (the turn's Boost or Sabotage already used, a Roadblock, a type lock, fuel it cannot pay, no open Part slot); outside the mod step the hand header says when cards play instead. The track lane under each car names what is waiting on its next advance, a Roadblock on its Boosts, and on the player's turn the Boosts they have played with what each does to the coming advance, cleared when the turn passes. An advance's log line ends with what changed the distance, base feet and only the steps that moved the number. A Part chip on a car carries its printed text for hover.

**Refused plays** (phase 25): a tap on a hand card that cannot be played, or on a car that is not a valid target for the card just picked, answers instead of doing nothing. A notice appears under the prompt in the guide's box but in the correction colour, pointing down at the hand or up at the garage, and says which card and why in the words the hand header and the faded card already use: the card waiting for a car or a pick, the other player's turn, the step cards play in, the turn's Boost or Sabotage already used, a Roadblock, a type lock, fuel it cannot pay, no open Part slot, a Part or Tow Truck on the other garage's car, a car with no fuel to move, or the same car twice. One OK closes it, and it clears itself on the player's next action or change of selection, while the other player's moves leave it; a deflect ping sounds with it. On a phone it stays in the column and scrolls into view; reduced motion drops the fade. The faded card keeps its one-line reason, so a player who reads before tapping needs no notice.

**Owner artwork** (phases 21 and 22). Beyond the car illustrations, the owner supplies the game's other art, and each piece switches on only when its file exists, so the game draws the piece itself until then. Sources live in `game-images/` and `scripts/art/import_assets.py` encodes them by kind: mod illustrations (`game-images/mods/<mod-id>.png` to `public/art/mods/`, fitted whole into 640 by 360 and padded with the picture's own edge colour so nothing is cropped, 30 KB each, any subset, shown as a strip between a mod card's family line and its name); frames (`public/frames/`, 512-square tiles under 60 KB: the six car types behind the car frame, `mod-part`, `mod-boost`, and `mod-sabotage` as the mod card's border, and `back`, the card back, which fans the opponent's hand beside its count; the type frames show only as a full set of six and the mod frames as a full set of three, so a deck is never half-dressed); backdrops (`public/backgrounds/`, as drawn under 250 KB, for the collection, builder, online, profile, and result screens, and `track`, a strip under 40 KB repeated along the lanes); icons and tokens (`public/icons/`, 128-square with transparency under 8 KB: `type-<type>` on the type badge as a set of six, `family-<family>` on the mod family line as a set of three, `fuel` as the fuel token, `wear` as the wear mark, `pink-slip` on the pink slip badge, `pack` above the pack pop-up's line). Each output folder carries a credits note saying the files are the owner's own, and `src/ui/assets.ts`, written by the import, lists what is present and carries a version the import bumps, appended to every artwork address so a changed file reaches browsers that cached the old one; a test holds the lists to the files, the budgets, the names, and the whole-set rule.

**Desktop scale**: every size in the game is in rem, so the root font size is the zoom. It is the browser's default on phones and small windows, 18px from 1100px wide, and 20px from 1500px, and from 1100px the garage rows show the medium card and the hand a fuller mod card, so on a desktop the cards and their figures read at arm's length instead of at phone scale; rows still scroll when they must.

**Card detail** (phase 19): every card opens a panel that reads the real car, so the roster is something to read as well as play. Where a tap is free (the opponent's garage on the board, your own garage while the other player acts, the collection, the pack reveal, the winner's banner and result screen, the start screen's garage picker) the whole card opens it. Where a tap already acts (your garage and hand on your turn, the deck builder) a small round info button hangs on the card's upper right corner, a little outside the frame, muted until hover or focus and always visible on touch, with the hand's copy count moved to the upper left and a Foil or Holo tag shifted left to make room, as a sibling of the card so the card's own button and rings are untouched; a faded card in the hand still opens from it. The panel is one native dialog for the whole app: Escape, the backdrop, and Close dismiss it and focus returns to the card. A card bought on the collection screen opens its own panel the same way, the one opener that is not a tap. A car shows its illustration at card size, make and model with generation, type with its identity in words, tier with the fuel it needs and its Part slots, the stock advance per turn in feet as the engine computes it with no wear, no mods, and not a first advance, horsepower, weight, hp per lb, drivetrain, 0–60, top speed, engine, production years, a tier note when it has one, and the source the figures came from. A mod shows the card itself, its family and kind, the full rules text, type lock, fuel cost, rarity and level with the base it upgrades, and one sentence on how the family plays. Nothing about play changes.

**Leaving a local match**: the board header of a CPU or hotseat match has Exit match, which asks once and then returns to the start screen; a match left this way counts for nothing, no packs and no tally. Online matches leave through the online bar, where Leave concedes (section 13).

**Board order**: each garage row shows its staged car first, so the two cars in the race lead their rows and stay in view on a phone, where the row scrolls; the other cars keep the order the engine holds them in. When the staged car changes or a new race begins, the row scrolls back to its start so the staged car is in view without a swipe. The camera keeps the action in view on a phone with four moves. Advance first brings the track into view, skipped when it is already visible, and the advance lands once the scroll has settled, on the scroll's end or after 400 ms, with the buttons held for that beat, so the player sees their own car move. When the player's turn ends, after a 600 ms beat, any row that was scrolled returns to its start and the track comes into view, so the other player's turn plays where it can be seen. Any advance by the other player brings the track into view at once. When it becomes the player's turn to stage, their own garage comes into view, so the cars they are being asked to keep or swap are on screen without a scroll; it waits for the race-end banner to close, since the engine reaches staging while the banner is still up, it happens once per staging turn, and the guided first match keeps its own first board. Every move is smooth unless reduced motion is set, in which case it is instant and the beats are skipped. **Every screen opens at its top**, at once, since a new view has nothing to animate from. The button that reaches one sits below the main action, near the bottom of the screen you were on (section 8, Button order), so on a phone the deck builder and the collection would otherwise open half-way down with their own headers off screen. Three moments inside a match do the same: Continue after a race opens the next race at the top of the page, unless the player is the one staging, in which case their garage comes into view instead; the result screen opens at the top and returns there when the pack pop-up closes; and the pop-up returns to its own top with each pack opened.

**Guided first match** (phase 24): the first CPU match a browser plays carries a short guide that says one thing at a time, at the reading level of the rules dialog: stage a car, place fuel, play mods and end the step, advance, and, at the line, what the pink slip means. Each step is a callout in the flow of the board, under the prompt and above the buttons, so it sits between the garage it points up at and the buttons and hand it points down at; on a phone it stays in the single column instead of floating over the cards, and a new step scrolls itself into view, smoothly unless reduced motion is set, which also drops its fade-in. The finish step is a line in the race-end banner above Continue. A step shows once: OK hides it, and a step the board has moved past does not come back. Skip guide ends the guide, and so does Continue at the first finish line; either is remembered under `pink-slips.guide.v1`, so the guide never shows again in that browser. Hotseat and online matches never show it. Five steps, under 120 words in all, with sentences of twenty words or fewer and every number from the tunables, and each step carries the phrase the board's prompt uses for it.

**Sound** (phase 16). Music and effects, on by default, with one control. Browsers refuse to play anything before the page is clicked or tapped, so nothing sounds until the first gesture; that gesture unlocks audio and starts the music.

- *Music*: six original tracks composed by the owner, encoded to MP3 at about 128 kbps because MP3 plays in every browser, credited in `public/audio/CREDITS.md`. They play in a shuffled order that never repeats a track back to back: within a screen each track plays to its end and the next follows, and entering a match or returning to the start screen crossfades into the next track of the order, so every screen opens on new music. A match plays at about a fifth of full scale and the menus at a third, under the effects, and the music dips to a third of its level for a moment whenever an effect fires. Music streams through media elements routed into the same audio engine as the effects, so the levels and the ducking hold on phones too: the opening track is created and buffered as soon as the page opens where the browser allows it, and playback starts on the tap after a fraction of a second is buffered rather than after the whole file, with an 80 ms ramp against a click. The successor in the order is created and buffered once the current track plays, so track ends and scene changes start at once; at most two elements exist at a time. With `?sound=debug` in the address a small readout shows the engine state, the buffered seconds, and the time from tap to sound, for chasing problems on a phone. Music pauses while the tab is hidden. On iPhones the engine is silent while the ringer switch is on unless an ordinary media element is playing, so the first gesture also starts a looping tenth of a second of silence in one, and the unlock listens on every gesture until the engine reports that it runs.
- *Effects* (phase 23 for the recordings): each effect is an owner-made recording when its file exists, an MP3 under `public/audio/effects/` encoded by `scripts/audio/encode_effects.py` from the owner's WAV originals kept outside the repository, mono, trimmed, peak-normalised, and cut to the effect's length, credited in `public/audio/effects/CREDITS.md`; every listed file is fetched and decoded once after the first gesture, and an effect with no file plays its synthesized recipe, so the set can be replaced one sound at a time. The launch's intensity bends a recording's pitch and level as it shapes the synthesized one. The recipes, all made with the Web Audio API in one style: stage (a low thump and click), fuel (a short filtered tick), advance (an engine launch, a sawtooth sweep with noise that grows with the distance), a skipped advance (a two-blip stall), boost (a rising whoosh), part (a metallic clink), sabotage (a descending buzz), an ignored sabotage or a refused play (a deflecting ping), coin flip (spinning ticks ending in a chime), race end (a three-note major sting with a noise swell), match end (a longer fanfare in place of the sting), draw and reshuffle (card flutters), and the viewer's own turn starting against the CPU or online (a soft cue). Outside the engine: a pack reveal (a high sparkle) and a rare pull, an Ultra Rare car or a holo, adding a shimmer; scrapping spare cards for credits (a handful of coins landing in a pile, the gaps closing as it settles) and buying a card with them (a register in the three parts one makes, the key, the bell, and the drawer running out). Both sound only once the change has gone through, so a refused scrap or an unaffordable card stays silent. Ordinary buttons are silent.
- *Control*: a speaker button on the start screen and in the board header opens two switches, Music and Effects, remembered under `pink-slips.sound.v1`.
- *Why*: the launch, the finish, and the reveal are the moments the game is built around, and a sound is what makes each land, for every age in the audience.

## 9. Architecture

A static web app, plus two small Cloudflare Workers: the matches-played counter, and the room service that holds online matches (section 13).

This section records the design decisions behind the code. `docs/architecture.md` is the companion technical write-up: what runs where, where state lives, how a match flows through the parts, and the stack decisions with their reasons.

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

**Owner artwork**: `src/ui/assets.ts` is the generated list of what is present, `src/ui/artwork.ts` turns it into URLs with the whole-set rules, and the cards, the track, the pack pop-up, and the screens ask it for each piece; `scripts/art/import_assets.py` encodes the sources and writes the list.

**Card detail**: `src/ui/detail.ts` builds the rows for a car or a mod as pure data, tested; `src/ui/CardDetail.tsx` holds the dialog and its provider, `src/ui/detailContext.ts` the context that hands cards an opener; `src/ui/useDetail.ts` is the hook the card components and the collection screen read, null where no panel is mounted so they work as before; `detailTargetFor` in `detail.ts` turns a bare card id into the panel's target, tested.

**Sound**: `src/ui/sound/` holds the settings, a pure mapping from log entries to effect names (`soundsBetween`, tested over played-out matches), the effects, recorded where `effectFiles.ts`, written by `scripts/audio/encode_effects.py`, lists a file and synthesized otherwise, the music player, and a provider that owns the unlock gesture; screens diff their states the way the race-end moment does and play what the diff names.

**Take-backs**: a local match keeps the states from before each mod play of the current mod step in its session and restores one on Undo; the room keeps the same stack in its snapshot and restores one on an `undo` message from the seat that played, then sends both seats their views.

**Persistence**: custom garages and decks in `localStorage`, wrapped in try/catch, with the loaner garages always available. The collection and its unopened packs sit next to them under their own key, through the same wrapper (section 12).

**Matches-played counter**: the one number that lives outside the browser. A Cloudflare Worker in `counter/` keeps a count in KV, answers GET with it, and adds one on POST from the game's origin, at most once every ten seconds per address. The site reads the worker URL from `VITE_COUNTER_URL` at build time; without it the counter is silent. One increment per finished match, sent from the client when the result screen appears, so abandoned matches do not count. KV writes are not atomic, and a lost count now and then is accepted. The count shows as one muted line at the bottom of the start screen and nowhere else.

**Rules in the game**: a native dialog, opened from the start screen, the board header, and the deck builder header, with the rules written as a walkthrough in seven short sections, in the order a first match asks for things, for readers from about age nine up, with sentences under twenty words and under 500 words in all, whose numbers come from `src/engine/tunables.ts` and whose wording matches the prompts on the board.

**Guided first match**: `src/ui/guide.ts` is pure and tested: the step texts, held to the rules dialog's limits by the same kind of test, and `guideStep`, which reads the board the way the prompt does. A held race end (the banner's `raceEnd`) is the finish step; otherwise the step is null unless `currentPlayer` is the viewer, null in the choice phase, and null while a selection or a Sponsor's options are open (the board's busy flag); in the staging phase it is the stage step while the viewer has no staged car, and in a turn it is the turn's step, fuel, mods, or advance. `src/ui/Guide.tsx` is thin: it draws the step, remembers the steps already shown so each appears once, and scrolls itself into view. `Match.tsx` turns the guide on for a CPU match when `pink-slips.guide.v1` says it has not finished, computes the step, hands the callout to the board and the finish line to the banner, and marks the guide done on Skip guide and on the Continue that follows the finish step.

**Mod hints and refused plays**: `src/ui/explain.ts` is pure and tested and reads only the state the board holds, so the redacted online view has all of it: `blockedReason` (why a hand card is faded in the player's own mod step, in the engine's own order), `handNote` (the hand header outside the mod step), `laneNotes`, `advanceSuffix`, and the answers to a refused tap, `whyNotPlayable` (a hand card, from a waiting selection or Sponsor pick through the other player's turn, the phase, and the step to the mod step's own reason) and `whyNotTarget` (a car during a Part or Tow Truck selection). `src/ui/Callout.tsx` is the one box the guide and the notice share. The notice is `Board` state: a hand card that cannot be played routes its tap to `onRefuse`, a garage routes a car with no intent to `onOther` while a selection is open, and the notice clears when the match state or the selection changes.

**Camera**: `src/ui/scroll.ts` holds the moves, `scrollRowBack` and `reveal`, which settles on the scroll's end or a timeout and returns a cancel, with the two timings; `src/ui/interaction.ts` holds the pure checks `handedOver`, `opponentAdvanced` and `canStage`, tested; `Board.tsx` counts both with its render-time adjustment and dispatches an advance from `reveal`'s callback, holding the buttons meanwhile. `Board` also holds a ref on the viewer's own garage, which `Garage` takes as a prop the way `RaceTrack` does, and reveals it once per staging turn. `scrollPageTop` and `scrollPanelTop` are the instant moves, called from `Board` when the race-end banner closes and the viewer is not the one staging, from `ResultScreen` when it mounts and when the pack pop-up closes, and from `PackDialog` when a pack opens.

**Stack**: TypeScript, React, Vite, Vitest. The site is a static build deployed to GitHub Pages by Actions on every push to `main`; the two workers are deployed by hand with `wrangler`, and the room worker bundles `src/protocol`, `src/server`, `src/engine`, `src/data` and two files from `src/collection`, so it goes out with every release rather than only when `server/` changes. The checklist is `docs/deploy.md`.

---

## 10. Scope

**v1**

- 52 cars at v1, 126 after the roster expansions; 33 mods; 3 loaner garages
- CPU, hotseat, and online play
- Music and sound effects, with a remembered control
- Every card unlocked (until phase 11 added packs and a collection; see section 12)
- Deck builder with saved garages
- Simulator and tuned numbers
- Live URL

**Post-v1, in likely order** (phases 10 to 15 in `BUILD_PLAN.md`)

1. Illustrated card art in one consistent style (phase 10)
2. Packs and a collection, with holo and foil variants (phases 11 and 12)
3. CPU difficulty levels (phase 13)
4. Online play: rooms by link or code (phase 14), then accounts, ranked matchmaking, and a leaderboard (phase 15); both done

What comes after is the backlog in `BUILD_PLAN.md`, ordered by value to the player in three tiers; the next phase is picked from the top of it.

---

## 11. Legal

Code is MIT licensed. Car names and marques are trademarks of their respective manufacturers. This project is unaffiliated with and not endorsed by any of them. The README carries the same note.

---

## 12. Collection and packs

Added in phase 11. Before it, every card was unlocked.

- The collection is per browser, in `localStorage` next to the garages, through the same try/catch wrapper. It holds a count per card id, cars and mods alike.
- A fresh browser owns the **intro set** (phase 28): six cars and sixteen mods at two copies each, 22 of the 159 cards. Everything else has to be opened. Before phase 28 the grant was the union of the three loaner garages, 46 cards including 31 of the 33 mods, which left almost nothing to find: 14 mods arrived at the three-copy deck limit, so 44% of the mod slots in a pack were dead on the first pack, and two of the thirteen Ultra Rare cars were given away before it.
- Finishing a match against the CPU or an online opponent earns 1 pack; winning it earns 2. A hotseat match earns 1. Packs wait in a stack until opened, either from the pop-up that follows the winner banner and the result screen right after a match, or from the Collection screen, which shows every card, owned ones in color with their counts, unowned ones dimmed.
- A pack holds 2 cars and 3 mods. Car odds follow the tier's rarity label: Common 55%, Uncommon 30%, Rare 12%, Ultra Rare 3%. Common mods are uniform across the 32; each mod slot has a 5% chance to hold a rare mod instead, uniform among the rare ones. Duplicates count.
- The deck builder adds only owned cards: a car needs one copy, and a mod can go in up to the smaller of 3 and the copies owned. Its messages say what is missing. Racing is untouched: the engine's match config is card ids only, and a saved garage stays raceable.
- Migration: the first load after phase 11 grants every card in an already saved garage, once. The grant is written back at once, so it never repeats.
- Pack opening runs through the engine's seeded generator with a fresh seed per pack, so it is testable and the simulator can measure it.
- The odds and rewards are tunables under `collection` in `src/engine/tunables.ts`; a change gets a balance-log line.

**The intro set** (phase 28). Six cars, kept from the loaner garages and capped at Performance so every Super and Hyper is opened rather than given: Raptor R, Ioniq 5 N, Mustang GT, RX-7, Civic Si, and the MX-5 Miata. Five of the six types are there; Luxury has no loaner car at or below the cap, so the first Luxury car a player owns comes out of a pack. The cars were chosen by measurement rather than by looks. A first list built around the 911 Carrera S, WRX STI and Prius left the set at 25% against the field where the loaners run 43 to 50, because it carried four cars on the ×1.0 distance multiplier and two under 240 ft; the shipped list carries three on a raised multiplier (the RX-7 and Civic Si at ×1.2, the Raptor R at ×1.17 since phase 50) and an EV launch bonus, and ran 46%; the type lab reads it at 44% and 46% on its two seeds after phase 50.

Sixteen mods at two copies each, thirty-two copies for a thirty-card deck. Every one sits a copy below the deck limit, so no pack slot is dead on the first pack. Parts: Turbo Kit, Stage 2 Tune, Weight Reduction, Drag Slicks, Fuel Cell. Boosts: Power Shift, Perfect Launch, Nitrous Shot, Pit Crew, Sponsor, Extra Tank, Launch Control. Sabotage: Wheelspin and Missed Shift, Fuel Siphon and Bad Tune. The granted half is the consistent half — flat, always castable — and every held-back mod teaches a new kind of decision: coin flips, self-costs, type locks, and denial. Red Light is held back deliberately as the best single find in the game, and Missed Shift is granted in its place so the deck can contest the stall game at all; a first draft that granted the four weakest sabotage cards could not. Concentrating the mods into a three-copy spine was tried and dropped: it bought about three points and cost six live pack slots. None of the three type-locked mods is granted, and each has a car in the set to land on, so a find is useful at once.

**Migration** (phase 28). A collection written against the old grant is rebased once: the free cards are taken back, everything opened or won is kept, and the intro set is laid down under it. The stored record carries a grant version, so the rebase runs once per record and never repeats. It happens in the browser on load and on the service when an account is read, and a guest record still on the old grant is rebased before a claim merges it, so the per-id max cannot hand the old cards back. A saved garage that now needs a card the player no longer has stays saved and leaves the start screen's picker until the builder fixes it, the rule stakes already uses. The collection screen says so once.

**Measured** (`npm run sim -- --packs 2000`, seed 1): from the intro set, owning every card takes a mean of 720 packs (median 663) against the 126-car roster; the old 46-card grant took 690 (median 633), and earlier rosters took 395 at 52 cars and 611 at 102. The first pack holding an Ultra Rare car arrives after a mean of 16.5 packs (median 12), and now it is the first the player owns rather than the third. Every mod in the game is owned after a mean of 38 packs (median 36), so the toolbox fills in a few evenings while the roster stays open for months. At one or two packs a match, new cards arrive from the first match on and a full collection is a long-term goal, with the last Ultra Rare cars as the chase. The Ultra Rare odds and the pack size are the levers if that proves too slow.

**Finishes** (phase 12). Every card pulled from a pack rolls a finish: 2% holo, 10% foil, the rest base. Both are cosmetic only. Foil is a shimmer on the frame; holo is a shimmer across the image area and is the rarer of the two. The collection counts foil and holo copies separately from the total, so a foil copy still counts toward ownership and deck limits. The best finish a player owns is the one that shows: in the collection, the builder, the player's own cards on the board, and the result screen; the CPU's cards stay plain. The treatment is CSS only, moves on hover, stays still under reduced-motion settings, and never touches the engine: match configs and match state carry card ids only. The pack reveal marks a foil or holo when one appears, and every card with a finish carries a small Foil or Holo tag.

**Scrapping and buying** (phase 30). Duplicates pile up faster than the roster fills: measured over 200 simulated collections, 45% of the cards a player holds are past any deck's use by pack 50 and 65% by pack 100, and a pack holds something new 95% of the time in the first twenty-five, 46% by the hundredth, and 5% past the two hundredth. So a surplus copy can be scrapped for credits, and credits buy a named card outright, up to the copies a deck could hold: one of a car, three of a common mod, one of a rare one. Buying stops at that line rather than at the first copy, because packs were otherwise the only way to a second or third copy of a mod a deck needs and credits could not finish one; and it stops there rather than nowhere, because a copy past it is surplus the moment it arrives and scrapping pays back less than buying cost. A copy is surplus only when no deck could ever hold it, one per car and three per common mod and one per rare mod, so scrapping never costs a card that could be played and one action can safely take the lot; a copy wearing a foil, holo or chrome finish is never scrapped, since `variants` counts finishes per card rather than tagging a copy. Both rates are keyed by tier, a mod grading as Common or, when the mod is rare, as Rare: scrapping gives 1, 2, 5 and 12 credits and buying costs 40, 80, 200 and 500, so about forty duplicates of a grade buys one card of it. Cheap surplus has to buy dear cards, because a spare Ultra Rare is itself almost never held: after 400 packs a collection holds about 1,076 spare common mods and 13 spare Hypers. Credits survive a lap the way unopened packs do, since a lap already returns the collection and taking the balance too would punish finishing. A bought card opens its own detail panel at once, so the payoff of a long grind is the card itself rather than a number changing, and a line under the picker names it once the panel is closed. A guest scraps and buys in the browser and a signed-in player through `POST /me/scrap` and `POST /me/buy`, and a guest's balance is added to the account's when they claim it, since credits are a balance rather than a count of cards held.

**Laps** (phase 27). A collection is complete when every car is owned at least once; mods and finishes do not count. The collection screen then offers Take the lap, behind a confirm with a keepsake picker. Taking the lap raises the lap count by one, returns the collection to the intro set plus every keepsake at one copy, keeps the unopened packs, clears foil and holo finishes, and removes custom garages that need a car given up. The keepsake, one car chosen per lap, wears Chrome, a fourth finish above holo that packs never roll, and a keepsake never changes hands under stakes: whoever holds it keeps it, and the other side gains nothing for it. From then on a pack holds `collection.packCars` plus one car per lap taken, capped at `collection.lapBonusCap` (`lapBonusCars` 1, cap 2: 2, then 3, then 4 cars), so each lap is quicker than the last without touching a race. The lap count shows as a plate reading "LAP n" on the collection summary, the profile with the keepsakes below it, the leaderboard's Lap column, and online on the board's garage headers, the opponent's card-back fan, and the result title; online the room sends both seats' laps with every view, so a guest, whom the room cannot know, shows no plate. Laps live in the collection record, so a guest keeps them in the browser and brings them along when claiming a player, where the larger count wins.

**Stakes** (phase 20). Off by default. With the toggle on, a match plays for its pink slips: when it ends, every car captured during it changes hands for real, the captor's collection gaining one copy and the owner's losing one, whoever won the match. A concede keeps what was already taken; a match left from the board still counts for nothing. Loaner cars, every car in a loaner garage, are exempt both ways, so a fresh collection can never be emptied. Every intro-set car is a loaner car, so the floor is covered by the same rule. A copy count never goes below zero. A saved garage that loses its last copy of a car stays saved and leaves the start screen's picker until the builder fixes it, the rule the builder already applies to unowned cars. Stakes are refused outright when either side races a garage the game dealt, for the reason loaner cars are exempt: it is not owned. Against the CPU they also need the Street or Pro level, since Rookie could be farmed, and a loaner on the CPU side: a garage of the player's own there would stake a collection against itself, since every car it could lose is one already held, so a win would only add a duplicate to scrap. That is the same reason hotseat has no stakes, and the toggle says so and disables itself when the CPU is set to one of the player's own garages. A loaner garage on the CPU side means nothing to gain and something to lose, which the toggle's line already says. A guest's browser applies the transfer to its own collection; a signed-in player's report goes to the service with the CPU result. A CPU match runs in the browser, so the service cannot check it, and what it accepts is bounded instead: **losses only**. Since stakes need a loaner on the CPU side and every loaner car is exempt, a real CPU match can never move a car *to* the player, so a report claiming one is either an old client or an invention and its gains are dropped. Losses stay trusted, because a client lying about those only robs itself. The rest of the bound holds as before: one report a minute, real cars only, loaner cars dropped, lists capped at the pink slips a match can hold. Online, the room holds the full state and the service moves the cars between the two accounts, so nothing a client says can invent one; see section 13. Hotseat has no stakes, since both players share one collection, and the toggle does not show in that mode. The result screen ends with a Stakes block naming what the player keeps and what they lost.

**A browser that will not store** (phase 32): a guest's collection lives only in their browser, so a blocked or full store means packs, scrapping, buying and the lap happen on screen and are gone on the next visit. Every one of them says so where the player is looking, in one sentence, rather than reporting success: the collection screen under the control that was used, the result screen under the title. The change still shows, since it is real for that page; what the player is told is that it will not last. A signed-in player is unaffected, since the service holds their collection.

---

## 13. Online play

**Shape** (phase 14). The room service is the only holder of a match. A client never runs the engine forward: it sends an `Action` and draws whatever view comes back. `redact(state, viewer)` in `src/engine/` makes the view. The viewer's own hand and garage stay as they are; the opponent's hand and both decks are replaced by `?` placeholders of the right length; the viewer's own deck is sorted so draw order never leaks; the random state is zeroed so the future cannot be simulated; the log stays, since it never carried hidden card ids. Zeroing the state is only worth the width of the state it hides, so the generator carries four 32-bit words and a real match is seeded with all four from the platform's random source: a player sees their own opening hand, which is the front of a shuffle of a deck they chose, and a 32-bit state could be searched offline until it reproduced that hand and then run forward to read the opponent's deck and every coin flip left. A rematch takes fresh randomness rather than a seed derived from the last match, so reading one match would not read the next. A view has the shape of a `MatchState`, so the board and the legality helpers run on it unchanged, and the legal actions from a view equal the legal actions from the full state.

**Protocol** (`src/protocol/messages.ts`, shared by the service and the client). Plain JSON over one WebSocket per client. Client to server: `join {name, garage}`, `resume {token}`, `act {action}`. Server to client: `welcome {code, seat, token}`, `waiting`, `state {view, names, plates, turnMsLeft}`, `presence {opponentConnected}`, `error {reason}`. Every inbound message is shape-checked before the room sees it, and the room checks the seat, the turn, and `isLegal` before `apply`. A rejected message changes nothing and answers with a reason.

**Rooms** (`src/server/room.ts`). One room per match, reached by a six-character code from an alphabet without look-alikes (no 0, O, 1, or I). The first joiner takes seat 0, the second seat 1, and the match starts with the room's seed the moment both are seated. Each seat gets a reconnect token; a socket that presents it takes the seat back and gets the current view, so a refresh or a dropped connection costs nothing. The room is a plain class with no platform code, rebuilt from its snapshot at any time; the adapter persists the snapshot and owns the sockets.

**Hosting**. A Cloudflare Worker in `server/` with one Durable Object per room, SQLite-backed, on the free plan. The worker answers `GET /new` with a fresh code and upgrades `GET /room/:code` to a WebSocket, which the object accepts with the hibernation API, so an idle room costs nothing between moves. The object writes the room snapshot after a message from a seat that changed it, and forgets the room a day after the last one, closing its sockets as it does, since a tab left open could otherwise build it again. Every socket also spends from a budget of messages, far above what play needs, so no client can make a room work faster than play does. Connecting takes no seat and proves nothing, and the code space is about a billion, so nothing is written until someone actually joins: a room a socket only opened lives in memory, rebuilt from the code the socket carries if the object hibernates in between, and never reaches storage. A socket that has not joined cannot write to a room or push its expiry out either, which is what let one be held alive indefinitely. Only the site's origin and the local dev server may connect. The service lives at `https://pink-slips-rooms.pink-slips-counter.workers.dev`; the site reads it from `VITE_ROOM_URL` at build time, and without it the online button does not appear.

**Client** (`src/ui/online.ts`, `OnlineScreen.tsx`, `OnlineMatch.tsx`). The online screen makes a room or joins by code, and a shared `?room=` link opens it with the code filled in. The seat's code and token are kept in `localStorage` under `pink-slips.online.v1` until the match ends, and the online screen offers to rejoin while they are there. The client reconnects on its own with a doubling wait from one to ten seconds and resumes with its token. The race-end moment works as in section 9, with one difference: views that arrive while the banner is up are held and applied on Continue. An online match earns packs by the CPU rule, one for playing and two for a win, and counts once on the matches-played counter, reported by seat 0. CPU and hotseat play are unchanged and work offline.


**Accounts and matchmaking** (phase 15). A player is made from a name alone. The game's audience is kids, teens, and adults, most of whom have no account with any sign-in provider, so there is no provider: `POST /auth/player` with a name makes the account on the service and answers with a session token and a recovery code, and the browser is signed in from that moment. The code is twelve characters from the room-code alphabet, shown once as three groups of four and kept only as a hash; `POST /auth/recover` with the code opens a session for the same player on another device, and `POST /me/recovery` issues a new code and retires the old one. Sessions last a year from their last use and renew themselves once a day, so a player who never wrote the code down is not signed out by time; `POST /auth/logout` ends one. A session is kept under a hash of its token, never the token, the way a recovery code is: a session is the stronger credential of the two, since it needs no second step and renews itself, so a read of the directory's storage must not be a signed-in browser for every player at once. The token travels in an `Authorization` header on every route that takes one; the two WebSocket routes, the room and the queue, take it on the URL instead, because a browser cannot set a header on a socket, and they are the only two that may. A token in a query string is written to request logs, to anything in between, and to browser history, and this one lasts a year. A cleared browser without the code loses the player, which the code view says plainly, and making several players is easy, which is accepted for a game of this size. Five new players an hour from one address, counted by the account directory rather than by the worker: the worker runs as many short-lived isolates, so a count kept in one is not a limit at all, where the directory is a single object for the whole service. The address is read where Cloudflare sets it and carried on a header the worker replaces rather than forwards, so a client cannot name its own. An IPv6 address is counted by its /64, since one client holds a whole /64 and can take a new address inside it for every request, and what the directory keeps is a hash of that, never the address, and only for the hour: each new player sweeps out every count that has run out. Rotating a code also ends every session opened before it, including the one that asked, since a code is rotated when the old one is thought to have got out and the sessions it opened are the thing to close; the browser doing the rotating is handed a replacement token so it is not signed out by securing its own account. The site stores the token under `pink-slips.session.v1`. Names are at most 24 characters and pass a filter shared by the service and the browser (`src/protocol/names.ts`): a short list of words refused anywhere in a name, a longer list refused as whole words so ordinary names that contain them still pass, and a few names reserved for the game such as the CPU's. Before the check, case, accents, look-alike digits and symbols, punctuation, and stretched letters are normalised, so spelling tricks do not get through. The browser shows the reason under the field before the button; the service refuses the name with the same reason; and any name stored before the filter existed is shown as Player, on the profile, the leaderboard, and in a room.

The accounts live in one Durable Object, `AccountDirectory`, behind a platform-free `Directory` class in `src/server/directory.ts`: one record per account with its provider identity, display name, rating, record, collection, saved garages, and sessions. A signed-in browser keeps a mirror of the account's collection and garages in `localStorage`, so every screen reads as before, and asks the service whenever something changes: the builder pushes garages with `PUT /me/garages`, the collection and the pack pop-up open packs with `POST /me/packs/open`, and a finished CPU or hotseat match reports itself with `POST /me/cpu-result`, which the service honours at most once a minute. Guest data is claimed once, on the first sign-in from a browser: card counts take the larger of the two copies, packs add up, garages are kept, and the account is marked claimed so nothing is ever merged twice. Nothing a client sends can set a pack count or a rating.

Packs earned online are awarded by the server. A room learns the account behind each seat, from the ticket in a ranked room and from the session on the socket in a friend room, and when the match ends it reports the winner and loser to the directory. The directory adds the packs by the online rule and, for a ranked match between two accounts, moves both ratings and records; the room then sends each seat a `result` message with its packs and rating change, and the client refreshes its mirror before the pack pop-up opens. A report that gets no answer, whether the directory refused it or the call itself failed, is kept and sent again on the room's next message or alarm, and the seats hear nothing until it lands. Every report is named from the room's code, the seed the room opened with and the match's number in the room, and the directory answers a name it has already applied with what it gave the first time rather than applying it again: an answer lost on its way back looks exactly like a report that never arrived, and applying that one twice would pay the packs twice and move a stakes car twice. Names are remembered for a week. A guest seat gets no packs from the server and keeps the local rule.

Ratings are Elo with K of 32 from a start of 1000, whole numbers, applied only to ranked matches: 1000 beating 1000 gives 1016 and 984, and 1000 beating 1200 gives 1024 and 1176. Matchmaking is a queue of sockets on the directory object, one per waiting account: `GET /queue` with the session upgrades to a socket, and the object pairs the two longest-waiting players. Once more than 50 accounts hold a rating, two players who have both waited under 30 seconds are paired only when their ratings are within 200 points; anyone who has waited longer takes the next player. The pair gets a fresh room set up with one ticket per seat, a `matched` message with the code and ticket, and the room seats only the ticket holders, naming them from their accounts. A queue tick runs every five seconds while anyone waits. The numbers live under `online` in `src/engine/tunables.ts`.

The profile screen shows the name, rating, record, cards owned, packs waiting, and the laps taken with the keepsakes in Chrome, with the leaderboard below: the top 50 accounts with at least one ranked match, by rating. A socket upgrade with no `Origin` header at all comes from a script rather than a page, and is allowed; any other site's origin is refused. That admits `scripts/online-smoke.ts`, which makes two players, queues them, plays the match, and checks that both ratings moved, against any deployment.

**Concede** (phase 18). Online, Leave during a started match asks once, then concedes: the room applies the engine's concede for that seat, clears the take-back stack, sends both seats the finished state, and reports the result as usual, so the opponent's screen ends at once and ratings follow. Packs follow only when at least one race reached the line, so two friends cannot farm packs by conceding back and forth. In the lobby, before the match starts, Leave just leaves.

**Rematch** (phase 26). After a friend match played for no stakes, the result screen's Play again asks the room for a rematch. The room tells both seats who has asked, so the screen reads "Waiting for X" on the seat that asked and "X wants to play again." on the other. When both have asked, the room starts a new match in the same room: the same garages and names, the seed advanced by one per match, the first move given to the seat that did not have it (the engine's `MatchConfig.firstPlayer`, which skips the coin flip), the take-back stack and the result latch cleared, and both seats get fresh views, so the board returns without leaving the room. The new match is reported at its end like any other. A ranked room refuses, since Play again there queues again, and a stakes room refuses, since its cars changed hands and the same garages would race a car the loser no longer owns; both keep New room. The saved seat now outlives the result, so a refresh during the offer rejoins the room; Leave, New room, and Back to start clear it.

**Turn timer** (phase 29). A ranked room gives the seat on turn `online.turnLimitMs` to act, shown as a clock in the online bar that turns pink under fifteen seconds; when it runs out that seat forfeits and the other wins, reported and rated like any other result, so an opponent who walks away cannot hold a match open forever. The clock restarts on every accepted action, so a player who is still playing is never rushed. A friend room is not timed, since waiting for someone to come back to a casual match is the point. The room keeps the deadline in its snapshot as an absolute time, so it survives a rebuild, but sends each seat the milliseconds left rather than the deadline, since a client clock can be minutes out; the screen anchors that remainder to its own clock and redraws once a second, recomputing from the anchor so a throttled tab is never stale. A dropped seat stops its clock, but only for `online.disconnectGraceMs` in total per turn, so reconnecting on a loop cannot stall a match; when the allowance is spent the clock runs on and the match ends whether the seat comes back or not. The engine's `forfeit` ends the match the way `concede` does but logs `timeout`, so the result screen reads "Bo ran out of time in turn 7." rather than saying they conceded, and the room counts a forfeit as a concede for packs, so a match given up before any race reached the line still earns nothing. A Durable Object has one alarm and the room already used it to forget itself a day after its last message, so the alarm is now set to whichever comes first and the handler decides which is due; a late alarm is harmless, since a timeout with time left on the clock does nothing.

**Not yet**: spectators, trading between players, and linking an outside sign-in as a second way to recover a player. Duplicates convert rather than trade (section 12).

**Stakes online** (phase 20). Both seats must be signed in with stakes on. The ranked queue carries each player's toggle and pairs a stakes player only with another stakes player; the room the queue sets up is marked for stakes. In a friend room the first player to join sets the room's stakes from their toggle; a joiner whose toggle differs is refused with a reason that names the setting, and a guest can neither open nor join a stakes room. When the match ends the room computes each seat's transfer from the pink slips in its own state, drops starter cars, and hands both transfers to the directory with the result; the directory applies them to the two accounts, and the result message tells each seat what it kept and what it lost. The room also hands over the cars each seat raced, and the directory checks both sides against their accounts as it moves anything: a car moves only out of a collection that holds it, a keepsake stays with whoever holds it, and a side that raced a car its account does not own takes nothing, while whatever of its own it staked still goes to the other side. The room seats any legal garage, so this is where a garage its player never opened is caught. The client's toggle is consent only; the cars that move are the room's reading of the match.
