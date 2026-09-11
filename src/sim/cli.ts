import { formatLevelReport, runLevelSimulation } from './levels.ts'
import { formatPackReport, runPackSimulation } from './packs.ts'
import { formatReport, runSimulation } from './run.ts'
import { formatTypeLabReport, runTypeLab, TYPE_LAB_DEFAULTS } from './typeLab.ts'

/**
 * `npm run sim -- --matches 20000 --seed 1`, `npm run sim -- --packs 10000` for pack opening,
 * `npm run sim -- --levels --matches 1000` for CPU level against level, or `npm run sim:types`
 * for the type lab (`--games`, `--tiered`, `--pro`, `--intro`, `--seed`; src/sim/typeLab.ts).
 */

function readArg(name: string, fallback: number): number {
  const args = process.argv.slice(2)
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? ''
    if (arg === `--${name}`) {
      const value = Number(args[i + 1])
      if (Number.isFinite(value)) return value
    }
    if (arg.startsWith(`--${name}=`)) {
      const value = Number(arg.slice(name.length + 3))
      if (Number.isFinite(value)) return value
    }
  }
  return fallback
}

const packs = readArg('packs', 0)
if (process.argv.includes('--levels')) {
  console.log(
    formatLevelReport(
      runLevelSimulation({ matches: readArg('matches', 1000), seed: readArg('seed', 1) }),
    ),
  )
} else if (process.argv.includes('--types')) {
  console.log(
    formatTypeLabReport(
      runTypeLab({
        games: readArg('games', TYPE_LAB_DEFAULTS.games),
        tiered: readArg('tiered', TYPE_LAB_DEFAULTS.tiered),
        pro: readArg('pro', TYPE_LAB_DEFAULTS.pro),
        intro: readArg('intro', TYPE_LAB_DEFAULTS.intro),
        seed: readArg('seed', TYPE_LAB_DEFAULTS.seed),
      }),
    ),
  )
} else if (packs > 0) {
  for (const laps of [0, 1, 2]) {
    console.log(
      formatPackReport(runPackSimulation({ trials: packs, seed: readArg('seed', 1), laps })),
    )
  }
} else {
  const report = runSimulation({
    matches: readArg('matches', 20_000),
    seed: readArg('seed', 1),
  })
  console.log(formatReport(report))
}
