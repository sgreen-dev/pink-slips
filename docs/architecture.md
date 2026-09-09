# Architecture

How the game runs: the moving parts, where state lives, and why the stack is what it is.

`DESIGN.md` is the source of truth for the *game* — the rules, the cards, the tunable values, the visual design. This document does not restate any of it. Where you need a rule, it points at a section.

## What it is

A card game that runs in a browser. The whole game — rules, opponent, collection, deck builder — is JavaScript in the page. Two small Cloudflare Workers add the two things a lone browser cannot do: hold a match between two people, and keep one number that everybody shares.

**Solo play needs no service at all.** Against the CPU or in hotseat, nothing leaves the browser except the site's own files. The only `fetch` outside the online, account and counter code is `src/ui/sound/sfx.ts:102`, loading an audio file from the site's own origin.

## What runs where

```
  Browser                          GitHub Pages
  ┌───────────────────────────┐    ┌──────────────────────┐
  │ React screens (src/ui)    │◄───┤ static build of dist │
  │ engine, cpu, data         │    └──────────────────────┘
  │ collection in localStorage│
  └──────┬──────────────┬─────┘
         │ WebSocket    │ GET/POST
         ▼              ▼
  ┌──────────────────┐  ┌─────────────────┐
  │ room worker      │  │ counter worker  │
  │  MatchRoom   (DO)│  │  COUNTS   (KV)  │
  │  AccountDir. (DO)│  └─────────────────┘
  └──────────────────┘
```

Three deployables, only the site automatic. See `docs/deploy.md`.

## Where state lives

| Store | Holds | Survives |
|---|---|---|
| Browser `localStorage` | `collection.v1` cards, packs, finishes, laps; `garages.v1` saved garages; `draft.v1` builder draft; `session.v1` account token; `online.v1` room seat; `guide.v1`, `sound.v1`, `rebase.v1` flags | that browser only |
| `MatchRoom` storage | `room` the match snapshot, `expiresAt` its day-long TTL | until the room expires |
| `AccountDirectory` storage | `acct:` accounts, `sess:` sessions, `prov:` providers, `rec:` recovery codes | the account |
| Counter KV | `matches`, plus `stamp:<address>` rate limits | forever |

All keys are prefixed `pink-slips.` in the browser. A guest's collection lives only in that browser; making a player copies it to the account, which is what carries it to another device.

Every browser read and write goes through a try/catch wrapper (`src/ui/storage.ts`), so a browser with storage disabled loses persistence but still plays.

## The parts

| Module | Does | Entry |
|---|---|---|
| `src/engine` | The rules. Pure, immutable, deterministic. | `createMatch`, `legalActions`, `apply`, `isOver` |
| `src/data` | The cars and mods, validated by tests. | `CARS`, `MODS`, `STARTERS`, `INTRO_SET` |
| `src/cpu` | The opponent. Reads only what a player could see. | `chooseAction` |
| `src/sim` | Runs CPU against CPU and prints balance reports. | `npm run sim` |
| `src/collection` | What a player owns, packs, stakes transfers. | `openPack`, `introCollection` |
| `src/protocol` | The online message shapes, shared by both sides. | `parseClientMessage`, `parseServerMessage` |
| `src/server` | The room and the account directory, with no platform code. | `Room`, `Directory` |
| `src/ui` | React screens plus pure logic modules that are tested. | `App.tsx` |
| `server/` | Cloudflare Worker: sockets, Durable Objects, storage. | `worker.ts` |
| `counter/` | Cloudflare Worker: one number in KV. Standalone. | `worker.js` |

`src/ui` splits deliberately: twenty `.ts` modules hold the logic, thirteen of them with their own unit tests, and the twenty-nine `.tsx` components stay thin. Vitest runs in a `node` environment with no DOM, so anything worth testing is moved out of the component rather than rendered in a test.

`DESIGN.md` section 9 has the folder map and the engine API shape.

## How a match runs

**Solo.** The browser owns everything. `Match.tsx` holds a `MatchState`, the player's tap becomes an `Action`, `apply` returns the next state, the screen redraws. The CPU is the same loop with `chooseAction` picking the action. No network.

**Online.** The room is the only holder of the match; a client never runs the engine forward.

```
client ──act {action}──►  room: check seat, turn, isLegal
                          apply(state, action)
                          redact(state, seat) for each seat
       ◄──state {view}──  broadcast, then persist the snapshot
```

`redact` (`src/engine/redact.ts`) is what makes this safe: the viewer's own hand stays, the opponent's hand and both decks become `?` placeholders of the right length, the viewer's deck is sorted so draw order cannot leak, and the random state is zeroed so nobody can simulate the future. A redacted view has the same shape as a `MatchState`, so the board and the legality helpers run on it unchanged.

Every inbound message is shape-checked by `src/protocol` before the room sees it, then the room checks the seat, the turn and legality before applying. Two layers, different jobs: the protocol says "this is a well-formed message", the room says "this move is allowed".

See `DESIGN.md` section 13 for rooms, accounts, ranking and the turn timer.

## Determinism

The engine is deterministic given a seed. The generator is mulberry32 and its state is a single integer living inside `MatchState`, so every engine function stays pure — each call returns a value and the next state rather than mutating anything (`src/engine/rng.ts`).

Four things depend on that: the simulator can replay a run exactly, tests can assert on outcomes, pack opening is reproducible from a seed, and redaction can zero the random state without breaking anything.

## Invariants the tooling enforces

- **The engine, CPU, simulator, protocol and server never import the UI or React.** An ESLint rule fails the build rather than trusting convention (`eslint.config.js`); it bans the `react` and `react-dom` packages outright, not just UI paths, and covers five directories although its comment names three. Note `src/collection` and `src/data` are not covered by that rule but are bundled into the room worker, so an import of the UI from either would reach the server.
- **Tunables live in exactly one file**, `src/engine/tunables.ts`, and a change there gets a line in `docs/balance-log.md`.
- **A match config carries card ids only** — no objects, no UI types. That is what let online play move the engine behind a server without rewriting it.
- **Every rule in `DESIGN.md` section 3 has a unit test.**

## Stack decisions

| Choice | Why |
|---|---|
| TypeScript, React, Vite, Vitest | No rationale recorded. Observable: the only runtime dependencies are `react` and `react-dom` — no router, no state library, no UI kit, no component test library. |
| A pure, immutable engine with no I/O | It is callable from a screen, a CPU loop, a simulator and a server without change. Online play reused it as-is. |
| Seeded RNG inside the state | Keeps every engine function pure and makes runs reproducible. |
| Static site on GitHub Pages | Solo play needs no service, so most of the game costs nothing to run and works with no account. |
| Cloudflare Workers with Durable Objects | One object per room gives a single authoritative holder. Hibernation means an idle room costs nothing between moves; the objects are SQLite-backed and on the free plan (`DESIGN.md` section 13). |
| `localStorage` for the collection | Keeps guest play working with no sign-up; an account is opt-in and copies it up. |
| Node running TypeScript directly | The simulator and the scripts run as `node src/sim/cli.ts` with no build step. The `erasableSyntaxOnly` compiler option is what keeps this working: it bans syntax Node cannot strip. |
| No sign-in provider | Stated plainly in `DESIGN.md` 13: the audience is kids, teens and adults, most of whom have no account with any provider, so a player is made from a name and carried by a recovery code. Built with GitHub sign-in first and replaced the same day. |
| MP3 for the music | It plays in every browser (`DESIGN.md` 8). The tracks stream through media elements routed into the audio engine, so levels and ducking still work on phones. |

Where a row says no rationale is recorded, that is a gap in the record, not an endorsement or a criticism.

## Build, test, deploy

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | `tsc -b` then `vite build` into `dist/` |
| `npm test` | Vitest, node environment, `src/**/*.test.ts` |
| `npm run lint` / `format:check` | ESLint / Prettier |
| `npm run sim` | CPU against CPU, prints the balance report |
| `npm run deploy:check` | Says whether the site and both workers answer |
| `npm run online:smoke -- <url>` | Plays a real ranked match against a deployment |

CI runs lint, format, tests and build on every push to `main`, then deploys the site. It does **not** deploy either worker, and two gaps are worth knowing: the root `tsconfig.json` references only the app and node configs, so `server/worker.ts` is never type-checked by CI, and ESLint is scoped to `.ts`/`.tsx`, so `counter/worker.js` is unlinted. Both surface only at `wrangler deploy`.

A build is about 394 KB of JavaScript and 30 KB of CSS, roughly 118 KB and 7 KB gzipped.

## Where to look next

| Question | Read |
|---|---|
| What are the rules? | `DESIGN.md` 3 |
| What is on a card, and what tiers and types mean | `DESIGN.md` 2 |
| What numbers can be tuned | `DESIGN.md` 4, `src/engine/tunables.ts` |
| How the CPU decides | `DESIGN.md` 6 |
| What the simulator measures | `DESIGN.md` 7 |
| How the collection and packs work | `DESIGN.md` 12 |
| How online play works | `DESIGN.md` 13 |
| How to deploy and check it | `docs/deploy.md` |
| Why a number changed | `docs/balance-log.md` |
| What was built when | `BUILD_PLAN.md`, `changelog/CHANGELOG.md` |
| What is still open, worst first | `docs/backlog.md` |
