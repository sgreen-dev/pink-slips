import { formatReport, runSimulation } from './run.ts'

/** `npm run sim -- --matches 5000 --seed 1` */

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

const report = runSimulation({
  matches: readArg('matches', 5000),
  seed: readArg('seed', 1),
})
console.log(formatReport(report))
