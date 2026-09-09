# Backlog

Everything open: defects, risks, gaps, and features not yet built. One line each, worst first.

**How to use it.** Pick from the top. When you take something on, set its state to `doing`; when it lands, set `done` and add the phase and commit, the way `BUILD_PLAN.md` does for phases. Anything new goes in with the next free id in its letter.

**Ids never change or get reused.** `1`–`23` are the original feature items and keep the numbers `DESIGN.md` and past commits refer to. Findings from the 2026-09-09 audit take a letter: **S** security, **Q** code and tooling, **G** gameplay and balance, **A** accessibility, **D** docs, **U** interface rules.

**Sev** is how much it matters: for a defect, how bad; for a feature, how many players feel it and how often. A superscript marks a row with a note below.

| ID | Kind | Sev | Item | Where | State |
|---|---|---|---|---|---|
| G4 | bug | high | Stakes against the CPU let a garage of your own be the opponent, so a win only ever added a duplicate to scrap — a collection staked against itself <sup>1</sup> | `src/ui/StartScreen.tsx`, `src/collection/stakes.ts` | done |
| S3 | bug | high | `isCollectionState` never checked `credits` or `grantVersion`, and `/me/claim` added the credits it let through to the account <sup>2</sup> | `src/protocol/records.ts` | done |
| Q5 | bug | high | Every collection writer discarded `saveCollection`'s boolean, so a guest whose storage is blocked or full opened packs, scrapped and bought, was shown all of it, and lost the lot on refresh with no message <sup>8</sup> | `src/collection/persist.ts` | done |
| Q6 | gap | high | `Directory.scrap` and `Directory.buy` had no test, nor did their guest twins, and phase 30's "Done when" claim that both sides behave the same was checked nowhere <sup>9</sup> | `src/server/directory.ts` | done |
| Q3 | risk | high | `server/worker.ts` was never type-checked: `server/tsconfig.json` was correct but referenced by nothing, so `tsc -b` never visited its 621 lines <sup>10</sup> | `tsconfig.json` | done |
| Q12 | risk | high | `counter/worker.js` was the only production code with no static checking of any kind: unlinted, in no tsconfig, and untested <sup>11</sup> | `counter/worker.ts` | done |
| S4 | risk | high | `/me/cpu-result` took the stakes transfer from the request body, so one crafted POST a minute was worth three named Ultra Rares <sup>3</sup> | `src/server/directory.ts` | done |
| S5 | risk | med | The match seed was 32 bits and was the whole RNG state, so a player could brute-force it from their own opening hand and read the rest of the match; rematch seeds were `seed + n` <sup>12</sup> | `src/engine/rng.ts` | done |
| S6 | risk | med | The account-creation limit lives in a per-isolate `Map`, so "5 per hour per address" resets with every new isolate | `server/worker.ts:121` | open |
| S8 | risk | med | Any unauthenticated socket creates a room Durable Object, and every message re-arms its 24-hour TTL, so rooms can be minted across the code space and pinned alive | `server/worker.ts:480,516` | open |
| S9 | risk | med | Session tokens are stored in plaintext as the storage key, while the weaker recovery code is hashed | `src/server/directory.ts:277` | open |
| S10 | risk | med | The session token is accepted on the query string for every `/me/*` route, not only the socket upgrade that needs it | `server/worker.ts:239` | open |
| S11 | risk | med | Rotating the recovery code does not revoke existing sessions, and there is no revoke-all — yet rotation is the only remedy the design offers | `src/server/directory.ts:256` | open |
| S7 | bug | med | A chrome keepsake is protected for a guest but not for a signed-in player: neither server path passes `applyTransfer` its `keep` argument | `src/server/directory.ts:481,520` | open |
| S11b | risk | med | Ratings are farmable by self-matching: the queue de-dupes on account id only, so two accounts one person controls will pair | `src/server/queue.ts:42` | open |
| Q7 | gap | med | `src/cpu/predict.ts` has 3 of 12 exports tested — the file that decides what the CPU thinks a card is worth | `src/cpu/predict.ts` | open |
| Q8 | gap | med | `sfx.ts` and `music.ts` are untested; only their name constants are imported by a test | `src/ui/sound/` | open |
| Q13 | risk | med | `scripts/*.ts` and `eslint.config.js` are outside every type-check | `tsconfig.app.json`, `tsconfig.node.json` | open |
| Q15 | risk | med | CI never runs on pull requests — every check runs after the code is already on `main` and about to deploy | `.github/workflows/deploy.yml:3` | open |
| Q24 | risk | med | The `state` frame's `view` is cast to `MatchState` on `isRecord` alone, so a malformed room crashes the board. Deliberate and asserted by a test, but `docs/architecture.md` says every inbound message is shape-checked | `src/protocol/messages.ts:243` | open |
| Q25 | bug | med | The sound context's `played` counter is in its memo deps and read by nobody, so every effect re-renders every consumer | `src/ui/sound/SoundContext.tsx:22` | open |
| Q20 | bug | med | Opening a pack did nothing at all when the call failed — no spinner, no error, where every sibling action set an error string. Closed with Q5, which had to give the same handler a message anyway | `src/ui/CollectionScreen.tsx` | done |
| Q21 | bug | med | `saveSession` swallows its write failure, so a player who just made an account is silently a guest next visit | `src/ui/account.ts:29` | open |
| G5 | gap | med | Common-tier garages win 4% against the field, and `DESIGN.md` 7's targets only cap the top, so the floor has never been measured. 55% of pack car slots sit in that band | `DESIGN.md` 7 | open |
| G3b | bug | med | A saved garage missing cards stays raceable in the start picker, though `DESIGN.md` 12 says twice it should leave until the builder fixes it, and the collection screen tells the player it does | `src/ui/builder.ts:156` | open |
| G6 | gap | med | A fuel-cost Boost can strand a car that then cannot advance, with no warning. The CPU has an explicit guard against exactly this; the player gets nothing | `src/engine/match.ts:313` | open |
| G7 | gap | med | The CPU undervalues Fuel Siphon because its forecast assumes the opponent always tops up. Exotics runs three copies and the CPU holds them all match | `src/cpu/predict.ts:402` | open |
| A1 | bug | med | The ranked turn clock is `aria-hidden` and signals urgency by colour only, before a forfeit that is rated like any loss | `src/ui/OnlineMatch.tsx:318` | open |
| A2 | bug | med | `GaragePicker` nests card buttons inside a `<label>`, so the radio absorbs five accessible names and the start screen gains ~30 tab stops that each toggle the radio they sit in | `src/ui/GaragePicker.tsx:17` | open |
| A3 | bug | med | Ownership on the collection grid is opacity-only — no text, no ARIA — on the screen whose job is showing what you own. The builder does it with words | `src/ui/CollectionScreen.tsx:417` | open |
| U1 | bug | med | The start screen's Sign out confirmed in the wrong order, against the rule added to `DESIGN.md` 8 in phase 31 <sup>4</sup> | `src/ui/StartScreen.tsx` | done |
| D1 | bug | med | Two orphaned `*Why here:*` lines under the High-value heading, left when items 9 and 6 moved to Done in `fced226` and only their body text went | `BUILD_PLAN.md:808` | open |
| D2 | gap | med | `DESIGN.md` 6's random-garage CPU figures have drifted: Street over Rookie is 70% not 77, Pro over Rookie 76% not 80. Starter-pairing figures are still exact <sup>5</sup> | `DESIGN.md` 6 | open |
| G8 | gap | low | Staging is sequential and public — the second chooser sees the opponent's car — where `DESIGN.md` 3.1 and 3.4 read as simultaneous. Pro is built on the asymmetry, so the doc is the likely fix | `src/engine/match.ts:158,861` | open |
| G9 | gap | low | Three advance steps the numbered formula in 3.3 does not describe: where a percentage Boost lands relative to sabotage, where Overdrive's fraction lands relative to wear, and what its second advance counts | `src/engine/advance.ts:104,114` | open |
| G17 | gap | low | The simulator's 5,000-match run measures each type and tier over about 250 games, roughly ±6 points, so a target can fail on one seed and pass on the next: on the current stream seed 1 fails the type cap, seeds 2 and 3 fail the tier cap, and seed 4 passes everything, while 40,000 matches passes all four comfortably. The caps are sound; the default run is too small to gate on | `src/sim/run.ts:65` | open |
| G10 | gap | low | First-player advantage measures 52.5% over 5,000 matches. The simulator prints it; no target checks it and the balance log never mentions it | `src/sim/run.ts:318` | open |
| G11 | bug | low | Red Light's skip clears every pending sabotage, including one stacked on an earlier turn, refunding the stalled player | `src/engine/match.ts:748` | open |
| G12 | bug | low | Extra Tank clears the take-back stack, so mods played before it can no longer be undone inside the same mod step | `src/ui/celebration.ts:131` | open |
| G13 | gap | low | Buying refuses a card you already own, which `DESIGN.md` 12 does not say — so credits can never buy a second copy of a mod a deck needs. A test now pins the current behaviour, so changing it means changing that test | `src/collection/collection.ts:404` | open |
| G2 | gap | low | `Profile.benchByRace` is false on all three CPU levels and read nowhere else. `DESIGN.md` 6 explains why; the field's own comment does not | `src/cpu/levels.ts:36` | open |
| G14 | gap | low | Street and Rookie can never play Overdrive or Nitrous Shot, since both read coin flips as tails. Exotics carries three Nitrous Shots and EVs two Overdrives as dead cards at two of three levels | `src/cpu/levels.ts:53,63` | open |
| G15 | bug | low | The pack report prints two completion measures that can never differ, since every mod is collected hundreds of packs before the last car | `src/sim/packs.ts:88` | open |
| A4 | gap | low | Fuel and wear on a board card have no text equivalent — pips and a hover `title`, unreadable on touch and to assistive tech | `src/ui/CarCard.tsx:58` | open |
| A5 | gap | low | Filter chips carry no `aria-pressed`, so the active filter is colour-only, where the mode and level toggles set it | `src/ui/Filter.tsx:13` | open |
| A6 | gap | low | Tabs use `role="tablist"`/`tab`/`aria-selected` with no `tabpanel`, no `aria-controls` and no arrow keys, so a widget is announced that does not behave like one | `src/ui/CollectionScreen.tsx:371` | open |
| A7 | gap | low | `aria-live="polite"` covers the whole packs section, so changing the buy dropdown re-announces the notice, summary, reveal and lap panel | `src/ui/CollectionScreen.tsx:222` | open |
| Q17 | gap | low | No coverage tooling, though `coverage` is already excluded in two configs. A report would have shown Q5–Q8 | `package.json` | open |
| Q28 | risk | low | The ESLint import boundary covers five directories but not `src/collection` or `src/data`, both of which are in the worker bundle. `persist.ts` already imports from `src/ui` through that gap — not breached, but unguarded | `eslint.config.js:32` | open |
| Q29 | gap | low | Five exported symbols with no caller: `STARTER_BY_ID`, `opponentOf`, `unlockEffects`, `effectsReady`, `engineRunning` | see note <sup>6</sup> | open |
| Q30 | gap | low | Two unreachable CSS rules: `.start__soon` and `.card-back--md`; `.card-back--sm`, the component's own default, has no rule at all | `src/index.css:642,2121` | open |
| Q23 | gap | low | Ignored write failures with recoverable consequences: the builder draft, the guide flag, the online seat, the sound settings | `src/ui/BuilderScreen.tsx:76` and three others | open |
| Q26 | gap | low | Every online scrap, buy and lap writes both localStorage keys twice, since `update` already mirrors | `src/ui/CollectionScreen.tsx:126` | open |
| Q27 | gap | low | The clipboard helper, the match-ended settle block and the sound-between effect are each duplicated between two components | `src/ui/OnlineMatch.tsx:198` and pairs | open |
| Q31 | gap | low | The `K` tunable's comment gives a formula without the type multiplier that the code and `DESIGN.md` 3.3 both include | `src/engine/tunables.ts:13` | open |
| Q32 | gap | low | An orphaned doc comment: the line describing `renamePlayer` sits above `scrapOnline` | `src/ui/account.ts:123` | open |
| Q33 | gap | low | The import-boundary rule's comment and error name three directories where the rule covers five | `eslint.config.js:31` | open |
| Q9 | gap | low | `DESIGN.md` 3.2's mod take-back has no engine test — defensible, since it is not an engine action, but three independent implementations exist and nothing checks they agree | `src/ui/celebration.ts`, `src/server/room.ts` | open |
| Q2b | gap | low | The Luxury and Off-road distance multipliers are asserted by no test: the advance tests compute the expectation from the tunable itself, so changing either would leave the suite green | `src/engine/advance.test.ts:32` | open |
| Q4b | gap | low | `advance.ts` clamps effective weight to a minimum of 1; `DESIGN.md` 3.3 states the subtraction with no floor | `src/engine/advance.ts:92` | open |
| Q10 | gap | low | A placeholder test asserting `1 + 1 === 2`, left from phase 0 | `src/placeholder.test.ts` | open |
| Q16 | gap | low | The Python art and audio scripts have no linting, type checking or tests. Reasonable, since they run by hand — but nothing records it as a choice | `scripts/art/`, `scripts/audio/` | open |
| Q24b | gap | low | No error boundary, so any thrown render blanks the page and a match in progress is unrecoverable | `src/main.tsx:12` | open |
| G16 | gap | low | Two tunables are hardcoded in copy: the pink-slip target and the track's distance marks | `src/ui/Garage.tsx:65`, `src/ui/RaceTrack.tsx:19` | open |
| S2 | risk | low | CI actions are pinned to moving major tags in a workflow holding `pages: write` and `id-token: write`. All five are first-party; SHA pins close it | `.github/workflows/deploy.yml:21` | open |
| S1 | risk | low | The counter's `Origin` check is not a control — any non-browser client sets the header. The one-per-10s-per-address limit is the real brake, and a test now pins both | `counter/worker.ts:26` | open |
| S12 | risk | low | The name filter is a Latin-only blocklist: a Cyrillic or fullwidth lookalike normalises to a space and splits the word. Enforced server-side, so this is filter quality, not placement | `src/protocol/names.ts:87` | open |
| S13 | risk | low | Names keep control and bidi characters. React escapes them, so no XSS — but spoofing and layout mangling are possible | `src/server/directory.ts:147` | open |
| S14 | bug | low | A finished match's result is dropped with no retry if the directory call fails: packs, ratings and transfers for that match are lost | `server/worker.ts:538` | open |
| S15 | risk | low | `/leaderboard` scans every account on every unauthenticated request, with no cache and no index. Harmless at 8 rated players; linear from here | `src/server/directory.ts:545` | open |
| D3 | gap | low | `docs/architecture.md` says counter KV survives "forever"; the rate-limit stamps expire after 60 seconds | `docs/architecture.md:40` | open |
| D4 | gap | low | `docs/architecture.md`'s UI module counts exclude `src/ui/sound/`, so the tested fraction reads 13/20 where it is 17/27 | `docs/architecture.md:61` | open |
| D5 | gap | low | `docs/architecture.md` named two CI gaps where there were five. Rewritten with Q3, which changed that paragraph anyway: it now names the three that remain | `docs/architecture.md:125` | done |
| D6 | gap | low | `README.md` called `npm run build` a type-check without the caveat that the room worker was not covered. True as written once Q3 landed; the line now names both | `README.md:39` | done |
| 13 | feat | high | Race animation: the car slides along its lane, a played mod flies to the table, a sabotage lands with a shake. CSS transitions keyed off the log entries the race-end moment already reads, off under reduced motion, never delaying an action. A section 8 addendum | `DESIGN.md` 8 | open |
| 21 | feat | high | A use for surplus fuel. Once every car sits at its cost each further token has nowhere to go <sup>7</sup> | `DESIGN.md` 3 | open |
| 8 | feat | med | Deleting a player from the profile page: a two-step confirm, then the service removes the account, its sessions, its recovery code and its leaderboard row, and the browser returns to guest play. Needs a `DELETE /me`, a test that a deleted player cannot be recovered, and a section 13 line | `DESIGN.md` 13 | open |
| 3 | feat | med | Seasonal starter garages built from the collection's most-opened cars | `DESIGN.md` 5 | open |
| 7 | feat | med | Linking an outside sign-in as a second way to recover a player, if lost recovery codes turn out to be common | `DESIGN.md` 13 | open |
| 15 | feat | med | Match history and car records: the last twenty matches with opponent, result and rating change, and each car's wins and losses. Needs a bounded history per account and a section 13 line | `DESIGN.md` 13 | open |
| 16 | feat | med | Daily first-win pack, plus a small badge set for milestones. A tunable, a test that the second win of a day earns nothing extra, and a section 12 addendum | `DESIGN.md` 12 | open |
| 17 | feat | med | Challenge a friend by name, online. Needs an invite store with expiry, two protocol messages, and a section 13 line | `DESIGN.md` 13 | open |
| 18 | feat | med | Installable app: a manifest and a service worker so the game installs to a phone and CPU and hotseat play work offline. Needs icons, a cache that updates on deploy, and a section 9 line | `DESIGN.md` 9 | open |
| 1 | feat | med | Trading duplicates between players. Converting them shipped as phase 30; trading needs a population first | `DESIGN.md` 12 | open |
| 2 | feat | low | Spectating a friend's online match | `DESIGN.md` 13 | open |
| 5 | feat | low | Card art for the Mustang Mach 1 and the Shelby GT500, the two cars still on the silhouette placeholder: no photograph under an accepted licence was on Commons. Add a row to `scripts/art/sources.csv` and run `make_art.py` when one appears | `scripts/art/sources.csv` | open |

## Notes

1. Both garage pickers were filled from one list, so the CPU's garage could be a garage you built from cards you own. Only the human seat's transfer is applied, and it is applied to the single local collection, so the CPU side lost nothing: winning added copies of cars already held, which scrap for credits. `DESIGN.md` 12 bans stakes in hotseat for exactly this reason and the test was never extended to the CPU. Fixed by `stakesAllowed` in `src/collection/stakes.ts`, which the start screen now asks and which has its own test.
2. `normalizeCollection` fills credits with `value.credits ?? 0`, and `??` replaces only null and undefined, so a string, a negative or `NaN` passed straight through the guard into `Directory.claim`, which adds it to the account. The guard simply was not updated when phase 30 added the field. Fixed, and `src/protocol/records.ts` now has the test file whose absence let it through.
3. Closed in phase 36, and not by capping what the path could mint — by removing it. The trust itself is unavoidable: a CPU match runs entirely in the browser, so `won` is client-reported too. But stakes need a loaner garage on the CPU side (the G4 rule) and every loaner car is exempt from stakes, so a legitimate CPU match can never move a car *to* the player. Measured before changing anything: 300 CPU matches with the CPU on a loaner garage gave **0** cars the player could gain against 614 they could lose. The service now takes losses only from a CPU report and drops gains, which also puts the G4 rule behind the service rather than only in the screen. Losses stay trusted, since a client lying about those only robs itself. An existing test had been pinning the old behaviour and was rewritten; removing the guard fails two tests.
4. On this row the note text already kept the destructive button clear of the arming spot, so a double-click never signed anyone out. The defect was the inconsistency: phase 31 wrote the rule and fixed `ProfileScreen`, missing that there are two Sign out confirms. Measured after the fix — a second click at the arming button's centre lands on no button, with `Sign out` 182 px away.
5. Re-measured at 4,000 matches per pairing, stable at 1,000. Starter pairings are still right to the point (Pro over Street 62%, Street over Rookie 75%, Pro over Rookie 82%), so the drift is confined to random garages — consistent with the roster growing from 102 to 126 cars after those numbers were taken. Re-measure the line; do not re-tune the CPU.
6. `src/data/starters.ts:99`, `src/ui/interaction.ts:186`, `src/ui/sound/sfx.ts:84,134`, `src/ui/sound/unlock.ts:46`.
7. Only Nitrous Shot and Fuel Dump spend fuel. Shapes considered: a pit stop in the mod step, once per turn, 2 surplus fuel to remove 1 wear — the recommendation, since it uses the wear system that exists and makes a repair-or-fuel-the-bench choice; a burnout before advancing, up to 2 fuel for +50 ft each; a pit crew action, 2 fuel to draw; or new Boosts that convert fuel with no core rule. Whichever is chosen needs an engine action with a section 3 rule and test, a CPU rule, a tunable, and the sim's targets re-run. Tabled on 2026-09-04 for more thought.
8. Fixed in phase 32. Every writer in `src/collection/persist.ts` now returns `{ state, saved }`, keeping `null` for an action that was never possible so a screen can tell the two apart and say the right thing. The collection screen reports a refused write under the control that was used and the result screen under the title; the change still shows, since it is real for that page. `Q22` and `Q23`, the other ignored write results, are still open.
9. Closed in phase 33, tests only, no behaviour changed. Four tests on the service side cover paying by grade and storing it, refusing a second scrap with nothing spare, buying and taking the price, and refusing a card already owned, one it cannot afford, one that does not exist, and a non-string id from a client that can send anything. Three on the guest side cover the same ground and then compare the two directly: one starting collection, scrapped and spent through both paths, ends with the same cards and the same credits. Mutation-checked — dropping the service's save, and drifting the guest's credits by five, each fail the tests that should catch them.
10. Fixed in phase 34, one line: the root `tsconfig.json` now references `./server`, so `tsc -b` and therefore `npm run build` and CI all check the worker and everything it bundles. The project also picked up the four strict options the app project already sets — `noImplicitReturns`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — and passes clean under them, so the worker was already written to that standard and is now held to it. Verified by planting a type error and an unused local in `server/worker.ts` and watching `npm run build` fail on each. `Q12`, the unchecked counter worker, followed in phase 35.
11. Closed in phase 35. `counter/worker.js` became `counter/worker.ts`, typed against `@cloudflare/workers-types` the way the room worker already is, with its own project referenced from the root `tsconfig.json` at the same strictness. ESLint went from applying **zero** rules to it to 85, since it is now a `.ts` file. Nine tests came with it, run against a fake KV: the read routes, the preflight, which origin is echoed, the write gate, the ten-second gap and that it is per address, and the method fall-through. `vite.config.ts` picks them up by including `counter/*.test.ts`, since the worker is standalone and its test sits beside it. Checked by planting a type error, and by disabling the origin gate and then the rate limit, each of which fails a test.
12. Closed in phase 37. The generator went from mulberry32, whose state is one 32-bit word, to xoshiro128** over four, and a real match is now seeded with all four from the platform's random source rather than one word expanded. Measured on this machine: candidate states can be checked at about 130 million a second, so the old space was exhaustible in **half a minute** and the new one is not. A rematch now takes fresh randomness instead of `seed + n`, so reading one match no longer reads the next; old room snapshots carrying a number seed are expanded rather than dropped, since rooms live a day. Balance is unchanged — 40,000 matches on each generator agree within a point on all four targets — and the check surfaced G17, that the usual 5,000-match run is too noisy at the caps to gate on.

## Checked and clean

Recorded so nobody spends the afternoon re-checking, as of the 2026-09-09 audit:

- **Balance holds.** All four `DESIGN.md` 7 targets pass at 5,000 matches, seed 1: types 56%, tiers 62%, Daily-only against Hyper-only 53%, median 14 turns. Every tunable matches the design and the last balance-log entry. Pack completion reproduces the log exactly at 720 packs, lap 0.
- **The rules are tested.** 24 of the 25 rules in `DESIGN.md` section 3 have an engine test; the exception is Q9 above.
- **Redaction is sound.** `redact` covers every `MatchState` field, and the log leaks nothing — `draw` and `reshuffle` carry a count only, and every other entry names a card already on the table. The weakness is the seed size (S5), not the redaction.
- **The CPU does not cheat.** Nothing in `src/cpu/` reads the opponent's hand or deck.
- **No stuck states.** The intro set builds a legal garage, the loaners are always offered, every finished match earns a pack, scrapping can never take a playable or finished copy, and nothing in the roster is unreachable from packs. Every online screen state has a way out.
- **No XSS, no wildcard CORS, no credentials in a CORS response, no secrets committed, no unhandled promise rejection, no `as any`, no dead tunables.** Token generation is a CSPRNG at 122 bits with no modulo bias, recovery codes are hashed at rest, and the internal directory routes are not externally routable.
- **`src/ui/storage.ts` itself is correct** and well tested; the problem is entirely at its call sites (Q5, Q21, Q23).

## Done

Closed items keep their ids. Phase and commits are in `changelog/CHANGELOG.md`.

| ID | Item | Closed |
|---|---|---|
| 4 | Stakes mode, starter cars exempt | phase 20, 2026-09-04 |
| 6 | A filter on player names | phase 17, 2026-09-04 |
| 9 | Sound: music, effects, one control | phase 16, 2026-09-04 |
| 10 | Turn timer with forfeit, online | phase 29, 2026-09-09 |
| 11 | Concede online | phase 18, 2026-09-04 |
| 12 | Guided first match | phase 24, 2026-09-08 |
| 14 | Rematch in the same room | phase 26, 2026-09-08 |
| 19 | Card detail view | phase 19, 2026-09-04 |
| 20 | Music on phones starting on the first tap | 2026-09-04 |
| 22 | Refused plays explained | phase 25, 2026-09-08 |
| 23 | Laps | phase 27, 2026-09-08 |
