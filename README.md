# Pink Slips

A web trading card game where real cars drag race a quarter mile. Win the race and you take the loser's car as a pink slip. First to three pink slips wins the match.

**Play it**: https://sgreen-dev.github.io/pink-slips/

Play against the CPU, or pass one screen between two players. Build your own garage in the deck builder and it is kept in your browser.

## How to play

If you have played the Pokémon Trading Card Game the shape will feel familiar: a garage instead of a bench, fuel instead of energy, mods instead of attacks, pink slips instead of prizes.

- Each player brings a **garage** of 5 real cars and a **mod deck** of 30 cards.
- One car from each garage is **staged** on the track. A coin flip decides who goes first.
- On your turn: draw a card, place one **fuel** token on any of your cars, play mods, then **advance** if your staged car has fuel at or above its cost. Fuel is never used up by advancing.
- A car's advance in feet comes from its horsepower and weight. Everyday cars need six or seven advances to cover 1,320 ft; hypercars finish in two but need six fuel before they move.
- **Parts** attach to a car for good and take a slot, two per car and three on a JDM car. **Boosts** help your car this turn, one per turn. **Sabotage** hits the opponent's staged car, one per turn.
- The first car to 1,320 ft wins the race. The winner takes the losing car as a pink slip, and the winning car gains a point of **wear** that slows it for the rest of the match.
- Three pink slips wins.

Each car type has one identity: EV cars launch harder, Muscle pulls at the top end, JDM cars take three parts, Sports cars win their first coin flip of each race, Luxury cars wear half as fast, and Off-road cars ignore traction sabotage.

Every car is a real production car with manufacturer-published horsepower and weight. Each entry in `src/data/cars.ts` names its source.

## Run locally

Requires Node 24 or later.

```sh
npm install
npm run dev
```

| Command                                    | What it does                                    |
| ------------------------------------------ | ----------------------------------------------- |
| `npm test`                                 | run the test suite once                         |
| `npm run lint`                             | ESLint                                          |
| `npm run format:check`                     | Prettier check                                  |
| `npm run build`                            | type-check and build to `dist/`                 |
| `npm run sim -- --matches 5000 --seed 1`   | play CPU against CPU and print the balance report |
| `npm run data:report`                      | print the roster grid by tier and type          |

Pushes to `main` build and deploy to GitHub Pages automatically.

The matches-played counter on the start screen is optional. It reads a small Cloudflare Worker in `counter/`; deploy it with `npx wrangler deploy` from that directory after creating a KV namespace, then set the worker URL as the repository variable `VITE_COUNTER_URL`. Without the variable the counter is simply absent.

## Project layout

`DESIGN.md` is the source of truth for the game. `BUILD_PLAN.md` tracks what was built and in what order. `docs/balance-log.md` records every change to the tunable numbers and the evidence behind it.

- `src/data` holds cars, mods, and starter garages as validated data
- `src/engine` holds the rules: pure TypeScript, deterministic given a seed
- `src/cpu` is the computer opponent, driving the engine through its public API
- `src/sim` is the headless simulator behind the balance numbers
- `src/ui` is the React app

## Legal

Code is MIT licensed. See `LICENSE`.

Car names and marques are trademarks of their respective manufacturers. This project is unaffiliated with and not endorsed by any of them.

The card illustrations are derived from photographs on Wikimedia Commons and are published under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). `public/art/CREDITS.md` names each photographer and the license of each source photograph.
