# Pink Slips

A web trading card game where real cars drag race a quarter mile. The winner of each race takes the loser's car. First to three pink slips wins the match.

**Play**: https://sgreen-dev.github.io/pink-slips/

## Status

Early development. `DESIGN.md` describes the game. `BUILD_PLAN.md` tracks what is built and in what order.

## Run locally

Requires Node 24 or later.

```sh
npm install
npm run dev
```

| Command                | What it does                    |
| ---------------------- | ------------------------------- |
| `npm test`             | run the test suite once         |
| `npm run lint`         | ESLint                          |
| `npm run format:check` | Prettier check                  |
| `npm run build`        | type-check and build to `dist/` |

Pushes to `main` build and deploy to GitHub Pages automatically.

## Legal

Code is MIT licensed. See `LICENSE`.

Car names and marques are trademarks of their respective manufacturers. This project is unaffiliated with and not endorsed by any of them.
