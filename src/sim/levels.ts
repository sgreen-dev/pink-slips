import { LEVELS, LEVEL_LABEL, type Level } from '../cpu/levels.ts'
import { playCpuMatch } from '../cpu/play.ts'
import { STARTERS } from '../data/starters.ts'
import { nextUint32, seedRng, type RngState } from '../engine/index.ts'
import { randomGarage, starterGarage, type GarageSpec } from './garages.ts'

/**
 * `npm run sim -- --levels`: every CPU level against every other, once over random garages and
 * once over the starter pairings, since the two answer different questions: how the levels
 * compare on any garage, and how they compare on the garages a new player actually races.
 */

export type GarageSet = 'random' | 'starters'

export const GARAGE_SETS: readonly GarageSet[] = ['random', 'starters']

export interface LevelTable {
  garages: GarageSet
  /** wins.get(a).get(b): matches a won against b, out of matchesPerPair, seats alternating. */
  wins: Map<Level, Map<Level, number>>
}

export interface LevelReport {
  matchesPerPair: number
  seed: number
  elapsedMs: number
  tables: LevelTable[]
  /** Milliseconds per action, by level, across every match it played. */
  msPerAction: Map<Level, number>
}

export function runLevelSimulation(options: { matches: number; seed: number }): LevelReport {
  const started = Date.now()
  let rng: RngState = seedRng(options.seed)
  const draw = (): number => {
    const [value, next] = nextUint32(rng)
    rng = next
    return value
  }
  const time = new Map(LEVELS.map((level) => [level, { ms: 0, actions: 0 }]))
  const pairs: [Level, Level][] = []
  for (const a of LEVELS) for (const b of LEVELS) if (a < b) pairs.push([a, b])
  const starterPairs: [GarageSpec, GarageSpec][] = []
  for (let i = 0; i < STARTERS.length; i++) {
    for (let j = 0; j < STARTERS.length; j++)
      starterPairs.push([starterGarage(i), starterGarage(j)])
  }
  const tables: LevelTable[] = []
  for (const garages of GARAGE_SETS) {
    const wins = new Map(LEVELS.map((a) => [a, new Map(LEVELS.map((b) => [b, 0]))]))
    for (const [a, b] of pairs) {
      for (let i = 0; i < options.matches; i++) {
        let garageA: GarageSpec
        let garageB: GarageSpec
        if (garages === 'random') {
          ;[garageA, rng] = randomGarage(rng)
          ;[garageB, rng] = randomGarage(rng)
        } else {
          const pair = starterPairs[i % starterPairs.length]
          if (!pair) throw new Error('No starter pairing')
          ;[garageA, garageB] = pair
        }
        const aSeat = i % 2 === 0 ? 0 : 1
        const players = aSeat === 0 ? [garageA, garageB] : [garageB, garageA]
        const levels: [Level, Level] = aSeat === 0 ? [a, b] : [b, a]
        const t0 = performance.now()
        const result = playCpuMatch(
          {
            players: [
              { garage: players[0]!.garage, deck: players[0]!.deck },
              { garage: players[1]!.garage, deck: players[1]!.deck },
            ],
          },
          draw(),
          { levels },
        )
        const ms = performance.now() - t0
        for (const level of [a, b]) {
          const t = time.get(level)
          if (t) {
            t.ms += ms
            t.actions += result.actions
          }
        }
        const winner = result.winner === aSeat ? a : b
        const loser = winner === a ? b : a
        wins.get(winner)?.set(loser, (wins.get(winner)?.get(loser) ?? 0) + 1)
      }
    }
    tables.push({ garages, wins })
  }
  return {
    matchesPerPair: options.matches,
    seed: options.seed,
    elapsedMs: Date.now() - started,
    tables,
    msPerAction: new Map(
      [...time].map(([level, t]) => [level, t.actions === 0 ? 0 : t.ms / t.actions]),
    ),
  }
}

export function formatLevelReport(r: LevelReport): string {
  const lines = [
    `CPU levels: ${r.matchesPerPair} matches per pairing, seed ${r.seed}, ${(r.elapsedMs / 1000).toFixed(1)} s`,
  ]
  for (const table of r.tables) {
    lines.push(
      '',
      `Row level beats column level, ${table.garages === 'random' ? 'random garages' : 'starter pairings'}`,
      `${''.padEnd(8)}${LEVELS.map((l) => LEVEL_LABEL[l].padStart(8)).join('')}`,
    )
    for (const a of LEVELS) {
      const cells = LEVELS.map((b) => {
        if (a === b) return '-'.padStart(8)
        const w = table.wins.get(a)?.get(b) ?? 0
        return `${((100 * w) / r.matchesPerPair).toFixed(0)}%`.padStart(8)
      })
      lines.push(`${LEVEL_LABEL[a].padEnd(8)}${cells.join('')}`)
    }
  }
  lines.push('', 'Milliseconds per action')
  for (const level of LEVELS) {
    lines.push(`${LEVEL_LABEL[level].padEnd(8)}${(r.msPerAction.get(level) ?? 0).toFixed(3)}`)
  }
  return lines.join('\n')
}
