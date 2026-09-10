# Deploy

Three things are deployed. Only one of them is automatic, which is the trap.

| Part | Deploys | Where |
|---|---|---|
| **Site** | automatically, on every push to `main` | https://sgreen-dev.github.io/pink-slips/ |
| **Room worker** (`server/`) | **by hand, every release** | https://pink-slips-rooms.pink-slips-counter.workers.dev |
| **Counter worker** (`counter/`) | by hand, once ever | https://pink-slips-counter.pink-slips-counter.workers.dev |

## Every release

```
git push origin main                  # the site builds and deploys itself
npm run deploy:rooms                  # the room worker does not
npm run deploy:check                  # everything answers, and all on one commit
```

**Deploy the room worker every time, without deciding whether it is needed.** It takes about three seconds and running it twice is harmless. The alternative is a rule about which paths matter, and getting that rule wrong is how a release ships half a feature.

`npm run deploy:rooms` and `npm run deploy:counter` wrap `wrangler deploy` and stamp the commit into the worker, which it then answers `/version` with. The site writes the same thing into `version.json` at build time, so `deploy:check` compares all three and **fails when they disagree** — a site running against a worker that was never redeployed is now something it says out loud (backlog `Q36`). They refuse a dirty tree, since a worker claiming a commit whose code is not what is running is worse than one that claims nothing; `--dirty` overrides it and marks the stamp.

If you want the rule anyway: `server/worker.ts` bundles `src/protocol/`, `src/server/`, `src/engine/`, `src/data/`, and two files from `src/collection/`. Only changes confined to `src/ui/`, `src/cpu/`, `src/sim/`, `public/`, or `src/index.css` are safe without it. Note that `src/engine/tunables.ts` is in that list, so **a tunable is a worker deploy** even though it reads like a game number.

**Done when**

- The Actions run on `main` is green.
- `npx wrangler deploy` printed a new Version ID.
- `npm run deploy:check` says every deployed part answered.

## First time only

- `npx wrangler login`.
- `npm run stats` reads how many browsers are playing, using the same `ADMIN_TOKEN` as `PINK_SLIPS_ADMIN_TOKEN`. There is no public route for it. Every figure counts **browsers**, not people: clearing site data, a private window or a second device each read as new, a shared laptop reads as one, and a browser asking not to be tracked is not counted at all, so the real number is that or a little higher (backlog `Q40`).
- Removing a player needs the admin secret, set once per deployment and never in `wrangler.toml`: `cd server && npx wrangler secret put ADMIN_TOKEN`. With no secret set the admin routes answer 404, so an unconfigured deployment has no admin surface to find. Give the same value to the scripts as `PINK_SLIPS_ADMIN_TOKEN`: `node scripts/admin.ts players` lists who is on the leaderboard with their ids, `node scripts/admin.ts delete <id>` removes one, and `node scripts/admin.ts delete-tests --yes` removes the players `online:smoke` leaves behind. `npm run online:smoke` now removes its own two when that variable is set, and prints their ids when it is not (backlog `Q39`).
- Crash reports from players' browsers go to the counter worker's KV namespace, since it is the one with storage and it gates nothing. `npm run errors` prints them newest first, `npm run errors -- --clear` empties the store. They are not on a public route: a stack trace is for whoever is fixing the bug. Only the message, the stack and the commit are kept, never a name, a collection or a room code (backlog `Q38`).
- The counter's KV namespace already exists; its id is in `counter/wrangler.toml`. To rebuild it: `npx wrangler kv namespace create COUNTS`, put the id in that file, `npx wrangler deploy` from `counter/`.
- Two repository variables, read at **build** time: `VITE_ROOM_URL` and `VITE_COUNTER_URL`. Changing either needs a site rebuild before it takes effect. Without them the online button and the counter simply do not appear — no error, they are just gone.

## Checking

`npm run deploy:check` fetches the site and one read-only route on each worker. It makes no players, opens no rooms, and adds nothing to the count, so it is safe to run as often as you like. `--rooms`, `--site` and `--counter` override the URLs; `--skip-counter` leaves it out.

For a real match end to end, against the live service or a local `wrangler dev`:

```
npm run online:smoke -- https://pink-slips-rooms.pink-slips-counter.workers.dev
npm run online:smoke -- <url> --stakes      # cars change hands
npm run online:smoke -- <url> --rematch     # a friend room plays twice
npm run online:smoke -- <url> --timeout     # a silent player loses on the clock
```

Each run makes two players, and account creation is capped at five per address an hour, so three runs in a row will start returning 429. That is the limiter, not a fault. It is counted by the account directory, so unlike before it will not quietly reset on a retry.

## What these checks cannot tell you

Neither worker reports which commit it is running, so `deploy:check` proves things are **up**, not that they are **current**. Deploying the site and the room worker together every time is what keeps them in step.

Two consequences worth knowing:

- `src/protocol/messages.ts` is the wire format for both sides, and the two deploys are not atomic. In the gap, an old client talks to a new room or the reverse. Both ends shape-check and drop what they do not recognise, so the failure is a quietly missing feature rather than a crash.
- The room worker is type-checked by `npm run build`, so a type error in `server/worker.ts` fails CI rather than waiting for `wrangler deploy`. Whether the deployed worker is the one this commit built is now `npm run deploy:check`'s job: every part reports the commit it was built from and the check fails when they differ. Deploy it every time anyway — the check tells you afterwards, and the point is not to need telling.
