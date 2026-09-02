import { MODS } from '../data/mods.ts'
import { CAR_TYPES, CAR_TYPE_LABEL, TIERS, type CarType, type Tier } from '../data/types.ts'
import { TIER_LABEL } from '../data/tiers.ts'
import { playCpuMatch } from '../cpu/index.ts'
import { nextUint32, seedRng, TUNABLES, type PlayerIndex, type RngState } from '../engine/index.ts'
import {
  randomGarage,
  singleTierGarage,
  singleTypeGarage,
  starterGarage,
  type GarageSpec,
} from './garages.ts'
import { analyzeMatch, mean, median, percentile, rate, tally, type Tally } from './stats.ts'

/**
 * The headless simulator (DESIGN.md section 7). Plays CPU against CPU across a set of
 * experiments and reports win rates, match length, mod play rates, and race outcomes by tier.
 */

export interface SimulationOptions {
  matches: number
  seed: number
}

export interface ModStat {
  plays: number
  /** Matches in which at least one player played it. */
  matchesWithPlay: number
  /** Matches won by a player who played it, counting each player separately. */
  playerMatches: number
  playerWins: number
}

export interface SimulationReport {
  options: SimulationOptions
  matches: number
  elapsedMs: number
  /** Single-type garage against random garages, by type. */
  byType: Map<CarType, Tally>
  /** Single-tier garage against random garages, by tier. */
  byTier: Map<Tier, Tally>
  /** Daily-only against Hyper-only, from the Daily side. */
  dailyVsHyper: Tally
  /** Starter pairings, from the first-named side. */
  starters: Map<string, Tally>
  /** Turns per player, random garages only. */
  lengthsRandom: number[]
  /** Turns per player, every match. */
  lengthsAll: number[]
  firstPlayer: Tally
  mods: Map<string, ModStat>
  /** Row tier's record against column tier in individual races. */
  raceMatrix: Map<Tier, Map<Tier, Tally>>
  /** Turns from staging to first advance, by tier of the staged car. */
  firstAdvanceDelay: Map<Tier, number[]>
  keeps: number
  swaps: number
}

/** Shares of the match budget per experiment. */
const SHARE = { types: 0.3, tiers: 0.2, dailyVsHyper: 0.1, starters: 0.15 } as const

export function runSimulation(options: SimulationOptions): SimulationReport {
  const started = Date.now()
  let rng: RngState = seedRng(options.seed)
  const draw = (): number => {
    const [value, next] = nextUint32(rng)
    rng = next
    return value
  }
  const report: SimulationReport = {
    options,
    matches: 0,
    elapsedMs: 0,
    byType: new Map(CAR_TYPES.map((type) => [type, tally()])),
    byTier: new Map(TIERS.map((tier) => [tier, tally()])),
    dailyVsHyper: tally(),
    starters: new Map(),
    lengthsRandom: [],
    lengthsAll: [],
    firstPlayer: tally(),
    mods: new Map(
      MODS.map((mod) => [
        mod.id,
        { plays: 0, matchesWithPlay: 0, playerMatches: 0, playerWins: 0 },
      ]),
    ),
    raceMatrix: new Map(TIERS.map((row) => [row, new Map(TIERS.map((col) => [col, tally()]))])),
    firstAdvanceDelay: new Map(TIERS.map((tier) => [tier, []])),
    keeps: 0,
    swaps: 0,
  }

  /** Plays one match with the subject in the given seat; returns whether the subject won. */
  const play = (subject: GarageSpec, other: GarageSpec, seat: PlayerIndex, random: boolean) => {
    const players = seat === 0 ? [subject, other] : [other, subject]
    const result = playCpuMatch(
      {
        players: [
          { garage: players[0]!.garage, deck: players[0]!.deck },
          { garage: players[1]!.garage, deck: players[1]!.deck },
        ],
      },
      draw(),
    )
    const analysis = analyzeMatch(result.state, result.winner)
    report.matches++
    report.lengthsAll.push(analysis.turnsPerPlayer)
    if (random) report.lengthsRandom.push(analysis.turnsPerPlayer)
    report.firstPlayer.games++
    if (analysis.firstPlayerWon) report.firstPlayer.wins++
    for (const [modId, counts] of analysis.modPlays) {
      const stat = report.mods.get(modId)
      if (!stat) continue
      stat.plays += counts[0] + counts[1]
      stat.matchesWithPlay++
      for (const player of [0, 1] as const) {
        if (counts[player] === 0) continue
        stat.playerMatches++
        if (result.winner === player) stat.playerWins++
      }
    }
    for (const race of analysis.races) {
      const won = report.raceMatrix.get(race.winnerTier)?.get(race.loserTier)
      const lost = report.raceMatrix.get(race.loserTier)?.get(race.winnerTier)
      if (won) {
        won.wins++
        won.games++
      }
      if (lost) lost.games++
    }
    for (const delay of analysis.firstAdvanceDelays) {
      report.firstAdvanceDelay.get(delay.tier)?.push(delay.turns)
    }
    report.keeps += analysis.keeps
    report.swaps += analysis.swaps
    return result.winner === seat
  }

  const record = (t: Tally, won: boolean) => {
    t.games++
    if (won) t.wins++
  }

  const total = Math.max(0, Math.floor(options.matches))
  const perType = Math.round((total * SHARE.types) / CAR_TYPES.length)
  const perTier = Math.round((total * SHARE.tiers) / TIERS.length)
  const dailyHyper = Math.round(total * SHARE.dailyVsHyper)
  const starterPairs: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 0],
  ]
  const perStarterPair = Math.round((total * SHARE.starters) / starterPairs.length)
  const randomCount = Math.max(
    0,
    total -
      perType * CAR_TYPES.length -
      perTier * TIERS.length -
      dailyHyper -
      perStarterPair * starterPairs.length,
  )

  for (const type of CAR_TYPES) {
    for (let i = 0; i < perType; i++) {
      let subject: GarageSpec
      let field: GarageSpec
      ;[subject, rng] = singleTypeGarage(type, rng)
      ;[field, rng] = randomGarage(rng)
      record(report.byType.get(type)!, play(subject, field, (i % 2) as PlayerIndex, false))
    }
  }
  for (const tier of TIERS) {
    for (let i = 0; i < perTier; i++) {
      let subject: GarageSpec
      let field: GarageSpec
      ;[subject, rng] = singleTierGarage(tier, rng)
      ;[field, rng] = randomGarage(rng)
      record(report.byTier.get(tier)!, play(subject, field, (i % 2) as PlayerIndex, false))
    }
  }
  for (let i = 0; i < dailyHyper; i++) {
    let daily: GarageSpec
    let hyper: GarageSpec
    ;[daily, rng] = singleTierGarage('daily', rng)
    ;[hyper, rng] = singleTierGarage('hyper', rng)
    record(report.dailyVsHyper, play(daily, hyper, (i % 2) as PlayerIndex, false))
  }
  for (const [a, b] of starterPairs) {
    const first = starterGarage(a)
    const second = starterGarage(b)
    const key = `${first.name} vs ${second.name}`
    const t = tally()
    for (let i = 0; i < perStarterPair; i++) {
      record(t, play(first, second, (i % 2) as PlayerIndex, false))
    }
    report.starters.set(key, t)
  }
  for (let i = 0; i < randomCount; i++) {
    let a: GarageSpec
    let b: GarageSpec
    ;[a, rng] = randomGarage(rng)
    ;[b, rng] = randomGarage(rng)
    play(a, b, 0, true)
  }

  report.elapsedMs = Date.now() - started
  return report
}

// Targets (DESIGN.md section 7)

export interface TargetResult {
  name: string
  value: string
  pass: boolean
}

export function checkTargets(report: SimulationReport): TargetResult[] {
  const maxType = Math.max(...[...report.byType.values()].map(rate))
  const maxTier = Math.max(...[...report.byTier.values()].map(rate))
  const dailyHyper = rate(report.dailyVsHyper)
  const medianTurns = median(report.lengthsRandom)
  return [
    {
      name: 'No single-type garage wins more than 60% against the field',
      value: pct(maxType),
      pass: maxType <= 0.6,
    },
    {
      name: 'No single-tier garage wins more than 65% against the field',
      value: pct(maxTier),
      pass: maxTier <= 0.65,
    },
    {
      name: 'Daily-only against Hyper-only lands between 35% and 65%',
      value: pct(dailyHyper),
      pass: dailyHyper >= 0.35 && dailyHyper <= 0.65,
    },
    {
      name: 'Median match is 25 or fewer turns per player',
      value: `${medianTurns}`,
      pass: medianTurns <= 25,
    },
  ]
}

// Formatting

function pct(value: number): string {
  return Number.isNaN(value) ? 'n/a' : `${(value * 100).toFixed(0)}%`
}

function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text
}

function tallyLine(label: string, t: Tally, width = 26): string {
  return `${padEnd(label, width)}${padStart(pct(rate(t)), 6)}  (${t.wins}/${t.games})`
}

export function formatReport(report: SimulationReport): string {
  const lines: string[] = []
  const { options } = report
  lines.push(
    `Pink Slips simulator: ${report.matches} matches, seed ${options.seed}, ${(report.elapsedMs / 1000).toFixed(1)} s`,
  )
  lines.push(
    `Tunables: K ${TUNABLES.advanceK}, fuel ${Object.values(TUNABLES.fuelCostByTier).join('/')}, wear ${TUNABLES.wearRate}, slots ${TUNABLES.partSlots}/${TUNABLES.partSlotsJdm}`,
  )

  lines.push('', 'Win rate against random garages, by single-type garage')
  for (const type of CAR_TYPES)
    lines.push(tallyLine(CAR_TYPE_LABEL[type], report.byType.get(type)!))

  lines.push('', 'Win rate against random garages, by single-tier garage')
  for (const tier of TIERS) lines.push(tallyLine(TIER_LABEL[tier], report.byTier.get(tier)!))

  lines.push('', 'Daily-only against Hyper-only, Daily side')
  lines.push(tallyLine('Daily wins', report.dailyVsHyper))

  lines.push('', 'Starter pairings, first-named side')
  for (const [key, t] of report.starters) lines.push(tallyLine(key, t, 36))

  lines.push('', 'Match length in turns per player')
  for (const [label, values] of [
    ['Random garages', report.lengthsRandom],
    ['All matches', report.lengthsAll],
  ] as const) {
    lines.push(
      `${padEnd(label, 16)} mean ${mean(values).toFixed(1)}  median ${median(values)}  p90 ${percentile(values, 0.9)}  max ${Math.max(...values)}  (${values.length} matches)`,
    )
  }
  lines.push(histogram(report.lengthsAll))
  lines.push('', tallyLine('First player wins', report.firstPlayer))

  lines.push('', 'Race outcomes by tier matchup, row tier win rate against column tier')
  lines.push(padEnd('', 14) + TIERS.map((t) => padStart(TIER_LABEL[t], 12)).join(''))
  for (const row of TIERS) {
    const cells = TIERS.map((col) => {
      const t = report.raceMatrix.get(row)!.get(col)!
      return padStart(t.games === 0 ? '-' : `${pct(rate(t))} /${t.games}`, 12)
    })
    lines.push(padEnd(TIER_LABEL[row], 14) + cells.join(''))
  }

  lines.push('', 'Turns from staging to first advance, by tier')
  for (const tier of TIERS) {
    const values = report.firstAdvanceDelay.get(tier)!
    lines.push(
      `${padEnd(TIER_LABEL[tier], 14)} mean ${mean(values).toFixed(1)}  median ${median(values)}  (${values.length} stagings)`,
    )
  }

  const restaged = report.keeps + report.swaps
  lines.push(
    '',
    `Race winner keeps its car: ${restaged === 0 ? 'n/a' : pct(report.keeps / restaged)}  (${report.keeps} keeps, ${report.swaps} swaps)`,
  )

  lines.push('', 'Mod play rates and win rate when played')
  lines.push(
    `${padEnd('Mod', 18)}${padStart('plays/match', 12)}${padStart('in matches', 12)}${padStart('win when played', 17)}`,
  )
  const sortedMods = [...report.mods.entries()].sort((a, b) => b[1].plays - a[1].plays)
  for (const [modId, stat] of sortedMods) {
    const winRate = stat.playerMatches === 0 ? Number.NaN : stat.playerWins / stat.playerMatches
    lines.push(
      `${padEnd(modId, 18)}${padStart((stat.plays / Math.max(1, report.matches)).toFixed(2), 12)}${padStart(pct(stat.matchesWithPlay / Math.max(1, report.matches)), 12)}${padStart(pct(winRate), 17)}`,
    )
  }

  lines.push('', 'Targets (DESIGN.md section 7)')
  for (const target of checkTargets(report)) {
    lines.push(`${target.pass ? 'PASS' : 'FAIL'}  ${target.name}: ${target.value}`)
  }
  return lines.join('\n')
}

function histogram(values: readonly number[]): string {
  if (values.length === 0) return ''
  const bucket = 5
  const max = Math.max(...values)
  const counts = new Map<number, number>()
  for (const v of values) {
    const key = Math.floor(v / bucket) * bucket
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const lines: string[] = []
  const peak = Math.max(...counts.values())
  for (let start = 0; start <= max; start += bucket) {
    const n = counts.get(start) ?? 0
    const bar = '#'.repeat(Math.round((n / peak) * 40))
    lines.push(`${padStart(`${start}-${start + bucket - 1}`, 8)} ${padStart(String(n), 6)} ${bar}`)
  }
  return lines.join('\n')
}
