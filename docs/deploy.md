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
cd server && npx wrangler deploy      # the room worker does not
npm run deploy:check                  # everything answers
```

**Deploy the room worker every time, without deciding whether it is needed.** It takes about three seconds and running it twice is harmless. The alternative is a rule about which paths matter, and getting that rule wrong is how a release ships half a feature.

If you want the rule anyway: `server/worker.ts` bundles `src/protocol/`, `src/server/`, `src/engine/`, `src/data/`, and two files from `src/collection/`. Only changes confined to `src/ui/`, `src/cpu/`, `src/sim/`, `public/`, or `src/index.css` are safe without it. Note that `src/engine/tunables.ts` is in that list, so **a tunable is a worker deploy** even though it reads like a game number.

**Done when**

- The Actions run on `main` is green.
- `npx wrangler deploy` printed a new Version ID.
- `npm run deploy:check` says every deployed part answered.

## First time only

- `npx wrangler login`.
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

Each run makes two players, and account creation is capped per address per hour, so a few runs in a row will start returning 429. That is the limiter, not a fault.

## What these checks cannot tell you

Neither worker reports which commit it is running, so `deploy:check` proves things are **up**, not that they are **current**. Deploying the site and the room worker together every time is what keeps them in step.

Two consequences worth knowing:

- `src/protocol/messages.ts` is the wire format for both sides, and the two deploys are not atomic. In the gap, an old client talks to a new room or the reverse. Both ends shape-check and drop what they do not recognise, so the failure is a quietly missing feature rather than a crash.
- The room worker is type-checked by `npm run build`, so a type error in `server/worker.ts` now fails CI rather than waiting for `wrangler deploy`. What CI still cannot tell you is whether the deployed worker is the one this commit built, which is why you deploy it every time.
