import { formatLevelReport, runLevelSimulation } from './levels.ts'
import { formatPackReport, runPackSimulation } from './packs.ts'
import { formatReport, runSimulation } from './run.ts'

/**
 * `npm run sim -- --matches 5000 --seed 1`, `npm run sim -- --packs 10000` for pack opening, or
 * `npm run sim -- --levels --matches 1000` for CPU level against level.
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
} else if (packs > 0) {
  console.log(formatPackReport(runPackSimulation({ trials: packs, seed: readArg('seed', 1) })))
} else {
  const report = runSimulation({
    matches: readArg('matches', 5000),
    seed: readArg('seed', 1),
  })
  console.log(formatReport(report))
}
