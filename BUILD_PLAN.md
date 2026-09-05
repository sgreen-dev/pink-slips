# Pink Slips — Build Plan

`DESIGN.md` says what the game is. This file says the order it gets built.

**How to use this plan**

- One phase per working session. Each phase ends with something runnable and a commit.
- Phases 10 and up change the design. Each starts by writing its "Design to record first" decisions into `DESIGN.md`, adjusted if the evidence says otherwise, before any code.
- Start every session by reading `DESIGN.md` and this file, then the phase's prompt line.
- A phase is done when every item under "Done when" is true. Not before.
- When a phase finishes, update its row in the status table and commit.
- Numbers from `DESIGN.md` section 4 live only in `src/engine/tunables.ts`. Changing one means updating that file and adding a line to `docs/balance-log.md` saying what changed and why.
- Commit messages are plain descriptions of the change.

## Status

| Phase | Name | Status | Commit |
|---|---|---|---|
| 0 | Tooling and deploy | done | 578e048 |
| 1 | Card data | done | 4de5699 |
| 2 | Engine core | done | c8febad |
| 3 | Engine mods | done | bb3d90c |
| 4 | CPU opponent | done | 54b5613 |
| 5 | Simulator and balance | done | a298e64 |
| 6 | UI foundation and hotseat | done | 9c23c85 |
| 7 | CPU play and match flow | done | ebd7797 |
| 8 | Deck builder | done | 6fbc20f |
| 9 | Polish and release | done | 8619114 |
| 10 | Illustrated card art | done | 7c2dbac |
| 11 | Collection and packs | done | a2b459d |
| 12 | Holo and foil variants | done | da7c6c2 |
| 13 | CPU difficulty levels | done | ffc297b |
| 14 | Online play, part 1: the engine behind a server | done | 0c7176d |
| 15 | Online play, part 2: accounts and matchmaking | done | 7f08ebe, 1bad706 |
| 16 | Sound | done | 8847fb6 |
| 17 | Player name filter | done | fc4ab82 |
| 18 | Concede online | done | b260d88 |
| 19 | Card detail view | done | 83f5775 |
| 21 | Owner artwork, part 1: mod illustrations, frames, card back | done | 30e467d |
| 22 | Owner artwork, part 2: backdrops, track, icons and tokens | done | 30e467d |
| 20 | Stakes | done | 312f4d8 |

---

## Phase 0 — Tooling and deploy

**Goal**: an empty app with a live URL and a green test run, so every later phase deploys for free.

**Deliverables**

- Node LTS installed on this machine
- Vite + React + TypeScript scaffold, strict TypeScript
- Vitest with one passing placeholder test, ESLint, Prettier
- `.gitignore`, `LICENSE` (MIT), `README.md` skeleton with the trademark note from `DESIGN.md` section 11
- `docs/balance-log.md` created empty
- GitHub Actions workflow: on push to `main`, build and deploy to GitHub Pages. Vite `base` configured for the Pages path.
- Public repo `sgreen-dev/pink-slips` created and first commit pushed

**Done when**

- The Pages URL renders the placeholder app
- `npm test` and `npm run lint` pass
- `git status` is clean after the push

**Prompt**: Do phase 0 of BUILD_PLAN.md.

---

## Phase 1 — Card data

**Goal**: every card in the game exists as validated data before any rule touches it.

**Deliverables**

- `src/data/types.ts`: `Car`, `Mod`, `Tier`, `CarType`, mod family and effect descriptor types. Mod effects are typed data the engine interprets, not functions.
- `src/data/cars.ts`: all 52 cars from `DESIGN.md` section 2.4 with verified `hp`, `weightLb`, flavor fields, and a `source` string per car. Tier computed from power-to-weight; any judgment placement carries a `tierNote`.
- `src/data/mods.ts`: all 30 mods from section 2.5 as effect descriptors.
- `src/data/starters.ts`: the three starter garages with placeholder 30-card decks.
- `npm run data:report`: prints the tier-by-type grid with counts.

**Tests**

- Unique ids across cars and mods
- Every car's tier matches its band or has a `tierNote`
- Every ★ car from the design doc is present
- Mod family ratio is roughly three Boosts per Sabotage
- Starter decks are exactly 30 with no mod over 3 copies, garages exactly 5

**Done when**: tests pass and the report prints the grid.

**Prompt**: Do phase 1 of BUILD_PLAN.md.

---

## Phase 2 — Engine core

**Goal**: a complete match plays deterministically with no mod cards.

**Deliverables**

- `src/engine/tunables.ts` with every value from `DESIGN.md` section 4
- Seeded random number generator
- `MatchState`, `createMatch`, `legalActions`, `apply`, `isOver` per section 9
- Rules from section 3: setup, coin flip for first player, the four turn steps with the mod step present but empty, first-turn advance skip, advance formula with wear, race end, pink slip capture, staging and free swap, match end, discard reshuffle

**Tests**

- One test per rule in section 3
- The worked example numbers in section 3.3
- Same seed produces the same match
- `apply` never mutates its input

**Done when**: a scripted match between two mod-less garages runs to a winner under a fixed seed, and tests pass.

**Prompt**: Do phase 2 of BUILD_PLAN.md.

---

## Phase 3 — Engine mods

**Goal**: every mod and every type identity works and is tested.

**Deliverables**

- Part slots with the JDM exception, Boost and Sabotage per-turn limits, type locks
- All 30 mod effects interpreted by the engine
- Pending sabotage on the opponent's next advance, cleared at race end
- Coin flips through the seeded generator, Sports first-flip rule
- Fuel-cost Boosts remove fuel from the staged car
- All six type identities from section 2.3

**Tests**

- One test per mod proving its effect and its limit
- One test per type identity
- `legalActions` rejects a second Boost, a second Sabotage, a Part into a full car, and a type-locked mod on the wrong type

**Done when**: every mod and type has a passing test.

**Prompt**: Do phase 3 of BUILD_PLAN.md.

---

## Phase 4 — CPU opponent

**Goal**: an opponent that plays legally and sensibly, usable by both the UI and the simulator.

**Deliverables**

- `src/cpu/` implementing the priorities in `DESIGN.md` section 6 against the engine API only
- Deterministic given state and seed

**Tests**

- Plays a winning Boost when one exists
- Plays a Sabotage that stops a winning advance
- Fuels the staged car when under cost, otherwise the best garage car
- 1,000 CPU versus CPU matches complete with no illegal action and no exception

**Done when**: those tests pass.

**Prompt**: Do phase 4 of BUILD_PLAN.md.

---

## Phase 5 — Simulator and balance

**Goal**: the numbers in `tunables.ts` are defended by evidence.

**Deliverables**

- `npm run sim -- --matches 5000 --seed 1` in `src/sim/`
- Garage generators: random, single-type, single-tier, starters
- The reports listed in `DESIGN.md` section 7
- Tuning pass against the starting targets, with every change logged in `docs/balance-log.md`
- Check each known risk in section 7 and record the finding

**Done when**: the starting targets are met, or `DESIGN.md` section 7 is revised with the reasoning and the new targets are met.

**Prompt**: Do phase 5 of BUILD_PLAN.md.

---

## Phase 6 — UI foundation and hotseat

**Goal**: two humans can play a full match on one screen.

**Deliverables**

- Palette and fonts chosen and recorded in `DESIGN.md` section 8
- Retro card component per section 8: Top Trumps stat block, Base Set stock and border, border color by type, stylized placeholder in the image area
- Race screen: two lanes from above, markers, distance readouts, finish line
- Garage view showing fuel, parts, and wear on every car
- Hand and action controls driven by `legalActions`
- Hotseat flow with the hand-over screen between turns
- Match start with starter garage selection, match end with pink slips shown

**Done when**: a hotseat match with starter garages plays start to finish in the browser.

**Prompt**: Do phase 6 of BUILD_PLAN.md.

---

## Phase 7 — CPU play and match flow

**Goal**: a stranger at the live URL can play a match against the CPU.

**Deliverables**

- Mode select: CPU or hotseat
- CPU turns played back with brief pacing so the player can follow
- Final starter decklists from `DESIGN.md` section 5, built against the tuned numbers
- Results screen and rematch

**Done when**: a full CPU match plays from the deployed URL with no console errors.

**Prompt**: Do phase 7 of BUILD_PLAN.md.

---

## Phase 8 — Deck builder

**Goal**: players build and keep their own garages.

**Deliverables**

- Browse all cars and mods with filters by type and tier
- Build a garage of 5 and a deck of 30 with live validation
- Save, load, rename, delete in `localStorage`, wrapped in try/catch, starters always present
- Custom garages selectable at match start

**Done when**: a custom garage can be built, saved, reloaded after a refresh, and raced.

**Prompt**: Do phase 8 of BUILD_PLAN.md.

---

## Phase 9 — Polish and release

**Goal**: v1 is finished and presentable.

**Deliverables**

- Responsive pass so the game is usable on a phone
- Marker slide animation on advances
- Keyboard focus and basic accessibility on controls
- `README.md`: what the game is, how to play, how to run locally, the live URL, the trademark note
- Tag `v1.0.0`

**Done when**: README is complete, the live URL matches `main`, all tests pass.

**Prompt**: Do phase 9 of BUILD_PLAN.md.

---

## Phase 10 — Illustrated card art

**Goal**: every car card carries an illustration in one consistent style, and the silhouette becomes a fallback.

**Design to record first** (`DESIGN.md` section 8): one style for all 52 cars; a 4:3 image sized 800 by 600; a side three-quarter view facing right, the direction the track runs; a plain backdrop close to the card's cream so the type-colored frame does the color work; WebP under 60 KB each and under 3 MB in total. The illustrations come from `scripts/art/`, a pipeline that turns one Wikimedia Commons photograph per car into the card style and writes the credits file. The first session built the pipeline and proved it on five cars; the rest is sourcing one photograph per car into `scripts/art/sources.csv` and rerunning it.

**Deliverables**

- The spec above written into `DESIGN.md` section 8
- `scripts/art/` with the pipeline, its dependency list, and the sources sheet, and `public/art/CREDITS.md` naming each photographer and license
- `public/art/<carId>.webp` for all 52 cars, and `imageUrl` set on every car in `src/data/cars.ts`. The phase 1 test that `imageUrl` is empty flips to require a path under `/art/`.
- `CarCard` shows the image lazily, keeps the silhouette underneath until the image has loaded, and falls back to it if the image fails
- Art license stated in `README.md` under Legal, separate from the MIT code license

**Tests**

- Every car has a non-empty, unique `imageUrl` under `/art/`
- Every referenced file exists in `public/` and the total stays under the size budget
- The card's fallback state: no image, loading, loaded, failed

**Done when**: every card on the live URL shows its illustration, the Cars tab of the deck builder transfers under 3 MB on first load, and the art tests pass.

**Prompt**: Do phase 10 of BUILD_PLAN.md.

---

## Phase 11 — Collection and packs

**Goal**: players earn packs by playing, open them, and build garages from what they own.

**Design to record first** (new `DESIGN.md` section 12, and section 10 moves "every card unlocked" into v1 history):

- The collection is per browser, in `localStorage` next to the garages, with the same try/catch wrapper. It holds a count per card id, cars and mods alike.
- A fresh browser owns every card in the three starter garages, so the starters stay fully playable. Everything else has to be opened.
- Finishing a match against the CPU earns 1 pack, winning it earns 2. A hotseat match earns 1. Packs wait in a stack until opened.
- A pack holds 2 cars and 3 mods. Car odds follow the tier's rarity label: Common 55%, Uncommon 30%, Rare 12%, Ultra Rare 3%. Mods are uniform across the 32. Duplicates count.
- The deck builder adds only owned cards. A car needs one copy; a mod can go in up to the smaller of 3 and the copies owned. On first load after this phase, a one-time migration grants every card in an already saved garage, so nothing a v1 player built stops working.
- The odds and rewards are tunables. They live in `src/engine/tunables.ts` under `collection`, so every number stays in one file, and a change gets a balance-log line.

**Deliverables**

- `DESIGN.md` section 12 with the rules above
- `src/collection/`: the collection model, pack opening through the seeded generator, persistence through the storage wrapper, and the migration
- A collection screen: all 84 cards, owned ones in color with counts, unowned ones dimmed, the builder's filters, and an Open pack button that reveals the five cards
- Packs awarded on the result screen and counted on the start screen
- Deck builder ownership limits with messages that say what is missing
- `npm run sim -- --packs 10000`: expected packs to own every card, and to open the first Ultra Rare car

**Tests**

- Pack contents follow the odds within tolerance over 10,000 packs at a fixed seed
- Starter cards are owned from the start; the migration grants saved-garage cards once and never twice
- The builder rejects an unowned car and caps mod copies at the copies owned
- Collection data survives corrupt storage the way garages do
- The engine's match config still takes card ids only; ownership never reaches it

**Done when**: a fresh browser starts with the starter cards only, earns a pack by finishing a CPU match on the live URL, opens it, and builds with a card from it.

**Prompt**: Do phase 11 of BUILD_PLAN.md.

---

## Phase 12 — Holo and foil variants

**Goal**: packs can turn up a foil or a holo, and the card shows it.

**Design to record first** (`DESIGN.md` section 12 addendum): two cosmetic variants, cosmetic only. Foil is a shimmer on the frame; holo is a shimmer across the image area and is the rarer of the two. Each card pulled from a pack has a 10% chance to be foil and a 2% chance to be holo. The collection counts each variant separately. The best variant a player owns is the one that shows, in the builder, on the board, and on the result screen. The treatment is CSS only, moves on hover, stays still under reduced-motion settings, and never touches the engine.

**Deliverables**

- The odds and rules in `DESIGN.md` section 12 and in `tunables.ts` under `collection`
- Variant counts in the collection model and variant rolls in pack opening
- Foil and holo treatments on `CarCard` and `ModCard`, and variant badges on the collection screen
- The pack reveal marks a foil or holo when one appears

**Tests**

- Variant odds over 10,000 packs at a fixed seed
- Best-variant selection with mixed counts
- Match config and `MatchState` carry no variant data

**Done when**: a foil and a holo can be opened on the live URL, look different from the base card and from each other, and a match plays with them showing.

**Prompt**: Do phase 12 of BUILD_PLAN.md.

---

## Phase 13 — CPU difficulty levels

**Goal**: three CPU levels that measurably differ, chosen at match start.

**Design to record first** (`DESIGN.md` section 6):

- **Rookie** fuels and stages by the section 6 rules but never uses the win rule or the stop rule, and spends a Boost or Sabotage only when it is worth twice the usual threshold. It stages by highest advance alone, ignoring wear.
- **Street** is the v1 CPU, unchanged.
- **Pro** adds three things: it holds a first-advance stall such as Red Light until the opponent's car is fueled and about to make its first advance; it values a bench car's fuel by the race it will be needed in, so a Hyper stays on the bench until it can move; and it reads coin flips at their expected value instead of as tails.
- Levels are a parameter to `chooseAction`, and the simulator reports level against level.

**Deliverables**

- `Level` on `chooseAction` and `playCpuMatch` in `src/cpu/`
- The start screen offers the level, default Street
- `npm run sim -- --levels`: a level-against-level table

**Tests**

- Rookie never plays the win or stop rule in the phase 4 scenarios where Street does
- Pro holds Red Light in a scenario where Street plays it at once
- Over 2,000 matches at a fixed seed: Pro beats Street at least 60%, Street beats Rookie at least 65%
- No level takes more than 50 ms per action on the 1,000-match run

**Done when**: those tests pass and all three levels can be picked and beaten on the live URL.

**Prompt**: Do phase 13 of BUILD_PLAN.md.

---

## Phase 14 — Online play, part 1: the engine behind a server

**Goal**: two people on different machines play a match through the live URL, with the server as the only holder of the truth.

**Design to record first** (new `DESIGN.md` section 13, and section 9 loses "no backend"):

- The server owns each `MatchState`. A client sends an `Action`; the server checks it with `legalActions`, applies it, and sends each player a redacted view: their own hand, the opponent's hand as a count, both decks as counts, everything on the table as is. The engine gains `redact(state, viewer)`, and the board renders from a redacted view.
- Transport is a WebSocket. Each match is one room reached by a link or a six-character code. No accounts in this phase. A reconnect token in `localStorage` resumes a match after a refresh or a dropped connection.
- Hosting is a small WebSocket service that keeps one object per match. The plan assumes a serverless platform with durable per-object state on a free tier; the owner picks the provider before the phase starts, and the choice goes in section 13.
- CPU and hotseat play keep working offline and unchanged.

**Deliverables**

- `redact` in `src/engine/` with the rule that a view never contains the opponent's hand or either deck's order
- `src/server/`: the room service, the message protocol as typed data in `src/protocol/` shared with the client, validation on every message, and reconnect
- Online mode on the start screen: create a room and share the link, or join by code, then pick a garage; the board drives the match through the protocol
- Deploy of the service alongside the Pages site, with the URL recorded in section 13

**Tests**

- `redact` never leaks: a property test over played-out matches finds no opponent hand card or deck order in any view
- Two fake clients play a full match through the protocol to a winner
- An illegal or out-of-turn action is rejected with a reason and changes nothing
- A client that disconnects mid-turn reconnects with its token and continues

**Done when**: two browsers on different machines play a full match through the live URL, and the server tests pass.

**Prompt**: Do phase 14 of BUILD_PLAN.md.

---

## Phase 15 — Online play, part 2: accounts and matchmaking

**Goal**: a stranger at the live URL signs in, presses Play online, and gets an opponent.

**Design to record first** (`DESIGN.md` section 13 addendum):

- Accounts made from a name alone, with a recovery code to carry one to another device; no sign-in provider, since most of the audience has none. (Built first with GitHub sign-in on 2026-09-04, replaced the same day.) The collection and saved garages move to the account and sync on sign-in; `localStorage` stays the guest fallback and the guest data is claimed on first sign-in.
- Matchmaking is a queue that pairs the two longest-waiting players. Each account carries a rating, Elo with K of 32, updated after every online match. Once more than 50 players hold a rating, the queue prefers pairs within 200 points when both have waited under 30 seconds.
- A profile page shows the name, rating, record, and collection size. A leaderboard shows the top 50.

**Deliverables**

- Sign-in, profile, and collection sync in the service and the UI
- The queue, the rating, and the leaderboard
- Packs earned online are awarded by the server, not the client

**Tests**

- Rating updates match Elo by hand for a win, a loss, and an upset
- The queue pairs the two longest-waiting players and never pairs a player with themselves
- Guest data is claimed once on first sign-in and not again
- A client cannot award itself a pack

**Done when**: two signed-in strangers queue from different machines and are matched into a match that counts toward their ratings.

**Prompt**: Do phase 15 of BUILD_PLAN.md.

**Live check**: `npm run online:smoke -- https://pink-slips-rooms.pink-slips-counter.workers.dev` makes two players, pairs them through the queue, plays the match, and prints both rating changes; run on 2026-09-04 against the live service: paired in one room, the winner went from 1000 to 1016 with two packs and the loser from 1000 to 984 with one, and both appeared on the leaderboard.

---

## Phase 16 — Sound

**Goal**: the game sounds like a drag race and a pack opening, with one visible control to turn music or effects off.

**Design to record first** (`DESIGN.md` section 8 addendum, section 9 line): six original tracks by the owner, encoded to MP3; effects synthesized in the browser, keyed off the engine log; sound on by default from the first gesture; a speaker button with Music and Effects switches, remembered.

**Deliverables**

- `scripts/audio/encode.py` and the encoded tracks in `public/audio/` with `CREDITS.md`; the WAV originals stay out of git
- `src/ui/sound/`: settings, the log-to-sound mapping, the synthesized effects, the music player, the provider with the unlock gesture, and the speaker button
- Effects in the local and online matches and the pack reveal; the music following the screen

**Tests**

- The mapping over played-out matches: every advance a launch, every race end a sting, the final one a fanfare, a skipped advance a stall, the coin flip and the draws at the start, the turn cue only for the viewer, nothing for no change
- The track choice: the menu track on menus, a seed-chosen race track in matches, the same track for both seats of a room
- The settings: on by default, round-trip through storage, a bad record ignored

**Done when**: the live site is silent until the first tap, then plays the menu track; a match plays a race track and every listed moment sounds; the switches turn each off and the choice survives a reload.

**Prompt**: Do phase 16 of BUILD_PLAN.md.

---

## Phase 17 — Player name filter

**Goal**: no player name on the leaderboard, a profile, or a room is one a kid should not see.

**Design to record first** (`DESIGN.md` section 13): one filter shared by the service and the browser, with normalisation of spelling tricks, a short list refused anywhere, a longer list refused as whole words, reserved names, and masking of names stored before the filter.

**Deliverables**

- `src/protocol/names.ts`: the normalisation, the lists, `nameProblem`, `safeDisplayName`
- The directory refusing a blocked name at creation and rename, and masking stored names on the profile, the leaderboard, and the room identity; the worker answering 400 with the reason
- The player pop-up and the profile showing the reason under the field before the button
- Room join names masked in the protocol parser

**Tests**

- Ordinary names pass, including ones that contain a blocked word; blocked words fail in any dressing; reserved names and empty names are refused with their own reasons; a refused name is never stored; a stored one is masked

**Done when**: a blocked name cannot be created or set on the live service, and the tests pass.

**Prompt**: Do phase 17 of BUILD_PLAN.md.

---

## Phase 18 — Concede online

**Goal**: leaving a started online match is a proper forfeit, so the opponent is never left in a room that cannot end.

**Design to record first** (`DESIGN.md` 3.5 and 13): a player may concede at any point of a started match and the other player wins; online, Leave during a match asks once, then concedes, and the room reports the result as usual.

**Deliverables**

- `concede(state, player)` in the engine, a log entry, and the narration line
- A `concede` client message and room handling that ends the match, clears the take-back stack, and lets the existing report send packs and ratings
- The online bar's Leave as a two-step confirm during a started match; the result screen's line for a conceded match

**Tests**

- The engine: a concede ends the match for either seat, on or off turn, and an over match is unchanged
- The room: both seats see the finished state, the result names the right winner and loser, and a concede before the start or after the end is refused

**Done when**: two tabs in a friend room end at once when one concedes, and the tests pass.

**Prompt**: Do phase 18 of BUILD_PLAN.md.

---

## Phase 19 — Card detail view

**Goal**: any card opens a panel with the real car's full spec, its years, and the source each figure came from, or a mod's full rules text, without stealing a tap from a card that already acts.

**Design to record first** (`DESIGN.md` 8, Card detail): where a tap is free the whole card opens the panel; where a tap already acts a small info button beside the card does; one native dialog for the whole app; the rows a car and a mod show, including the stock advance the engine computes.

**Deliverables**

- `src/ui/detail.ts`: pure row builders for a car and a mod
- `src/ui/CardDetail.tsx` and `src/ui/useDetail.ts`: the dialog, its provider, and the hook the card components read
- `CarCard` and `ModCard` opening the panel by the rule above, with the info button as a sibling inside a wrapper so the HTML stays valid
- The panel's styles, two columns on wide screens and stacked on phones

**Tests**

- Car rows carry the published figures, the hp per lb, the engine, the years, and the source verbatim, and the stock advance equals the engine's
- A tier note shows only when the car has one; mod rows carry the family sentence, the rules text, and rarity, level, lock, and cost where they apply

**Done when**: a card opens from the collection, the board, and the builder without acting, and the tests pass.

**Prompt**: Do phase 19 of BUILD_PLAN.md.

---

## Phase 20 — Stakes

**Goal**: an opt-in mode where every pink slip taken during a match changes hands for real, against the CPU and online, with starter cars exempt and both online seats consenting.

**Design to record first** (`DESIGN.md` 12 Stakes, 13 Stakes online, 6 levels, 8 toggle): what moves and when; starters exempt; CPU at Street and Pro only; the browser applies it for a guest, the service for a signed-in player and for both online accounts; a friend room's first join sets stakes and later joins must match; hotseat left out.

**Deliverables**

- `src/collection/stakes.ts`: the transfer from a finished state, applying it to a collection, and the wire guard
- The start screen and online screen toggles, the result screen's Stakes block, and the local match applying or reporting the transfer
- The room's stakes flag set at first join or from the queue, the result's transfers, the queue pairing only equal flags, and the directory applying transfers for CPU and match results
- The join and result messages carrying the flag and the transfer; the smoke script's `--stakes` flag

**Tests**

- Transfers both ways from a finished state, starters dropped, losses floored at zero, the guard rejecting bad shapes
- The directory applying a CPU report once a minute and a match result to both accounts; the room refusing mismatched and guest joins and reporting transfers; the queue pairing stakes with stakes; the messages carrying the fields

**Done when**: a CPU stakes match ends on a result screen with its Stakes block, the live smoke check pairs two stakes players and prints their transfers, and the tests pass.

**Prompt**: Do phase 20 of BUILD_PLAN.md.

---

## Phase 21 — Owner artwork, part 1: mod illustrations, frames, card back

**Goal**: the owner's artwork dresses the cards: an illustration strip on each mod card, textured frames on car and mod cards, and a card back that fans the opponent's hand, each switching on only when its file exists.

**Design to record first** (`DESIGN.md` 8, Owner artwork): folders, sizes, budgets, and the whole-set rule for frames.

**Deliverables**

- `scripts/art/import_assets.py` with the mods, frames, backgrounds, and icons kinds, the credits note per folder, and the generated `src/ui/assets.ts`
- `src/ui/artwork.ts` and the mod card's strip, the car and mod frames, `CardBack`, and the opponent's fan

**Tests**

- The generated list matches the files present by kind; every file is under budget and named in the spec; matched sets ship whole or not at all; every folder with files is credited

**Done when**: the game renders as before with no files, a check run of the import produces a strip and a tile in the scratchpad, and the tests pass. The owner's files land afterwards, batch by batch.

**Prompt**: Do phase 21 of BUILD_PLAN.md.

---

## Phase 22 — Owner artwork, part 2: backdrops, track, icons and tokens

**Goal**: the owner's artwork dresses the screens: backdrops for the collection, builder, online, profile, and result screens, a strip along the track lanes, and icons on the type badge, the family line, the fuel and wear tokens, the pink slip badge, and the pack pop-up, each falling back to today's drawing when absent.

**Deliverables**

- `Backdrop` shared by every screen, the track strip, and the icon and token hooks in the cards and the pack pop-up

**Tests**

- The artwork test covers the backgrounds and icons kinds, with the track's own budget and the whole-set rule for type and family icons

**Done when**: the game renders as before with no files and the tests pass; the owner's files land afterwards.

**Prompt**: Do phase 22 of BUILD_PLAN.md.

---

## Backlog

Anything new goes here first and becomes a phase when picked up. Items sit in value order within their tier, judged by how many players feel them and how often; a new item goes to the tier that fits, at the end. Numbers never change, since the design and past commits refer to them. A finished item leaves its tier for the Done list at the end, with the phase and the commits that closed it.

### High value: felt in every session by most players

   *Why here:* Every race, every pack, every finish; the largest change in feel still open.
   *Why here:* A public leaderboard for an audience that includes kids; one bad name is seen by everyone.
1. Trading duplicates, or converting them, once the collection has been live long enough to show how many duplicates players hold
   *Why here:* A full collection takes about 600 packs, so duplicates pile up early, and every pack after the first few dozen feels worse without it.
10. Turn timer with forfeit, online. A ranked player who stops acting gets a visible countdown, and when it runs out the match is forfeited and reported as a normal result, so an opponent who walks away or never returns cannot hold a match open forever. The room keeps the deadline in its snapshot and a Durable Object alarm fires it; the timer pauses while a seat is disconnected only for a fixed grace, then counts down anyway. Needs a tunable for the turn length and the grace, a room test that a timed-out seat loses, a `DESIGN.md` section 13 line, and the countdown in the online bar
12. Guided first match. The first CPU match a browser plays gets a short overlay that points at one thing at a time: stage a car, drop fuel, advance, watch the finish, continue. Dismissable at any step, never shown again once finished or skipped, and remembered in `localStorage`. Written to the same reading level as the rules dialog and tested for the same word limits. A section 9 addendum on how the overlay reads the board state
13. Race animation. On each advance the car slides along its lane over a short time instead of jumping, a played mod card flies from the hand to the table, and a sabotage lands on the opponent's car with a shake. All CSS transitions keyed off the log entries the race-end moment already reads, off under reduced motion, and never delaying an action. A section 8 addendum

21. A use for surplus fuel. Fuel is never spent by advancing, one token must be placed every turn, and fuel stays on a car between races, so once every car in the garage sits at its cost each further token has nowhere to go; only Nitrous Shot and Fuel Dump spend it. Shapes considered: a pit stop action in the mod step, once per turn, spending 2 fuel above a car's cost to remove 1 wear (the recommendation: it uses the wear system that exists, makes a repair-or-fuel-the-bench choice, and sits behind a tunable cost); a burnout before advancing, up to 2 surplus fuel for +50 ft each (direct, but it shortens races and competes with Fuel Dump); a pit crew action, 2 surplus fuel to draw a card (quiet, least effect on pace); or new Boosts that convert fuel with no core rule. Whichever is chosen needs an engine action with a section 3 rule and test, a CPU rule, a tunable for its cost, and the sim's targets re-run. Tabled on 2026-09-04 for more thought
   *Why here:* Surplus fuel shows up in most matches, and a sink turns dead turns into decisions.

### Medium value: felt often by some players

8. Deleting a player from the profile page: a two-step confirm, then the service removes the account, its sessions, its recovery code, and its leaderboard row, and the browser goes back to guest play with its local collection. Needs a `DELETE /me` route on the directory, a test that a deleted player cannot be recovered, and a `DESIGN.md` section 13 line
   *Why here:* Rare, but the one time it is wanted it matters, and a player should own their data.
3. Seasonal starter garages built from the collection's most-opened cards
   *Why here:* Freshness for returning players; nothing for a first visit.
7. Linking an outside sign-in (GitHub, Google) to a player as a second way to recover it, if lost recovery codes turn out to be common
   *Why here:* Insurance against lost recovery codes; only worth it if losses turn out to be common.
14. Rematch in the same room, online. After a friend match the result screen offers Play again to both seats; when both accept, the room starts a new match with the same garages, the seed advanced, and the seats' first-move order swapped. Needs a `rematch` message, a room state for one side having accepted, a test that a rematch swaps the first player, and a section 13 line
15. Match history and car records. The profile lists the last twenty matches with opponent, result, and rating change, and each car's wins and losses across the player's matches, so a player sees which cars work for them. The directory records a summary at result time; the room passes the winner's staged cars and the pink slips. Needs a bounded history per account, a test that the list is capped, and a section 13 line
16. Daily first-win pack. The first win of each calendar day, against the CPU or online, earns one extra pack, with the day boundary taken from the browser's clock for guests and the service's for players. A small badge set for milestones (first Ultra Rare, ten ranked wins, a full type) shown on the profile. A tunable for the bonus, a test that the second win of a day earns nothing extra, and a section 12 addendum
17. Challenge a friend by name, online. From the online screen, type a player's name to send an invite; the invited player sees it on their start screen while signed in and accepts into a private room. The seed of a friends list, which would follow. Needs an invite store on the directory with expiry, two protocol messages, and a section 13 line
18. Installable app. A web app manifest and a service worker that caches the built site and the card art, so the game installs to a phone's home screen and CPU and hotseat play work with no connection. Online play still needs one and says so. Needs the manifest, icons at the standard sizes drawn from the pink-slip mark, a cache that updates on deploy, and a section 9 line

### Low value: nice to have

2. Spectating a friend's online match
   *Why here:* A friend's match to watch; a small audience.
5. Card art for the Ford Mustang Mach 1 (2021) and the Ford Shelby GT500 (2020), the two roster-expansion cars still on the silhouette placeholder: no photograph under an accepted license was on Commons when the other 48 were sourced. Add a row to `scripts/art/sources.csv` and run `scripts/art/make_art.py <id>` when one appears
   *Why here:* Two cards out of 102, visible only when drawn.

### Done

9. Sound: original music, synthesized effects, and one control. Phase 16, 2026-09-04 (8847fb6, 3902484); the music start on phones fixed the same day (5c1aa6a).

6. A filter on player names. Phase 17, 2026-09-04 (fc4ab82, 12cd7a4).

11. Concede online. Phase 18, 2026-09-04 (b260d88, 0f45f13).

19. Card detail view. Phase 19, 2026-09-04 (83f5775, 20aec61).

20. Music on phones started on the first tap most of the time but not every time. Resolved 2026-09-04: the tracks stream and start on the tap (5c1aa6a, 9c888b8).

4. Stakes mode, in every mode but hotseat, with starter cars exempt. Phase 20, 2026-09-04 (312f4d8, the commit that marks it done).
