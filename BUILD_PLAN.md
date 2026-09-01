# Pink Slips — Build Plan

`DESIGN.md` says what the game is. This file says the order it gets built.

**How to use this plan**

- One phase per working session. Each phase ends with something runnable and a commit.
- Start every session by reading `DESIGN.md` and this file, then the phase's prompt line.
- A phase is done when every item under "Done when" is true. Not before.
- When a phase finishes, update its row in the status table and commit.
- Numbers from `DESIGN.md` section 4 live only in `src/engine/tunables.ts`. Changing one means updating that file and adding a line to `docs/balance-log.md` saying what changed and why.
- Commit messages are plain descriptions of the change.

## Status

| Phase | Name | Status | Commit |
|---|---|---|---|
| 0 | Tooling and deploy | done | 578e048 |
| 1 | Card data | todo | |
| 2 | Engine core | todo | |
| 3 | Engine mods | todo | |
| 4 | CPU opponent | todo | |
| 5 | Simulator and balance | todo | |
| 6 | UI foundation and hotseat | todo | |
| 7 | CPU play and match flow | todo | |
| 8 | Deck builder | todo | |
| 9 | Polish and release | todo | |

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

## Post-v1 backlog

In likely order. Each becomes a phase when picked up.

1. Illustrated card art in one consistent style, filling `imageUrl`
2. Packs and a collection, with holo and foil variants
3. CPU difficulty levels
4. Online play: engine moves behind a server, accounts, matchmaking
