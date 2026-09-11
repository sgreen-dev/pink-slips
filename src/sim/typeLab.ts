import { playCpuMatch, type Level } from '../cpu/index.ts'
import {
  introGarage,
  randomGarage,
  sameTierGarages,
  singleTypeGarage,
  type GarageSpec,
} from '../data/garages.ts'
import { CAR_TYPES, CAR_TYPE_LABEL, type CarType } from '../data/types.ts'
import { nextUint32, seedRng, TUNABLES, type PlayerIndex, type RngState } from '../engine/index.ts'
import type { TargetResult } from './run.ts'
import { mean, rate, wilson, type Tally } from './stats.ts'

/**
 * The type lab (DESIGN.md 7, backlog G20): how each car type does against the field, read closely
 * enough to tune by. `npm run sim` reads each type over about a thousand games, three points
 * either way; this reads the verdict over ten thousand, one point either way, and adds two
 * readings that say where a result comes from.
 *
 * - **Against the field**: five of the type's cars against five of any, the Street CPU on both
 *   sides. The verdict, since Street is the CPU most matches are played against.
 * - **Same tiers**: both garages hold the same five tiers, one side all of the type. What the
 *   type's own rules and cars do, apart from which tiers its cars sit in; the gap to the field
 *   reading is the part that does come from its tiers.
 * - **Pro**: the field reading again with the Pro CPU on both sides, which stages the car that
 *   needs the fewest turns to finish, fueling included. Counting fueling turns favours cheap cars,
 *   so types read very differently that way; a Pro reading outside the band is a warning rather
 *   than a failure, since it says the type's balance depends on how its cars are staged (G22).
 *
 * Every game is its own draw. The measured garage sits in each seat in turn and seat 0 always moves
 * first, so it moves first in exactly half its games. Each reading of each type plays from its own
 * seed, so resizing one reading leaves every other game as it was, and the same seed plays the same
 * garages before and after a tunable changes, which makes a before-and-after comparison sharper
 * than either number on its own.
 */

export interface TypeLabOptions {
  /** Games per type against the field: the verdict. */
  games: number
  /** Games per type with the tiers held equal. */
  tiered: number
  /** Games per type with the Pro CPU on both sides. */
  pro: number
  /** Games for the intro set against the field (DESIGN.md 12), which type tuning moves. */
  intro: number
  seed: number
}

export const TYPE_LAB_DEFAULTS: Readonly<TypeLabOptions> = {
  games: 10_000,
  tiered: 5_000,
  pro: 3_000,
  intro: 5_000,
  seed: 1,
}

export interface TypeCell extends Tally {
  /** Games in which the measured garage moved first: half of them, by construction. */
  firstGames: number
}

export interface TypeLabReport {
  options: TypeLabOptions
  elapsedMs: number
  field: Map<CarType, TypeCell>
  sameTiers: Map<CarType, TypeCell>
  pro: Map<CarType, TypeCell>
  intro: TypeCell
}

const EMPTY: TypeCell = { wins: 0, games: 0, firstGames: 0 }

/** Deals one game's two garages, the measured one first. */
type Deal = (rng: RngState) => [GarageSpec, GarageSpec, RngState]

function againstField(subjectOf: (rng: RngState) => [GarageSpec, RngState]): Deal {
  return (rng) => {
    const [subject, afterSubject] = subjectOf(rng)
    const [field, next] = randomGarage(afterSubject)
    return [subject, field, next]
  }
}

function measure(games: number, seed: number, level: Level, deal: Deal): TypeCell {
  const cell: TypeCell = { ...EMPTY }
  let rng = seedRng(seed)
  for (let i = 0; i < games; i++) {
    let subject: GarageSpec
    let other: GarageSpec
    let matchSeed: number
    ;[subject, other, rng] = deal(rng)
    ;[matchSeed, rng] = nextUint32(rng)
    const seat: PlayerIndex = i % 2 === 0 ? 0 : 1
    const [first, second] = seat === 0 ? [subject, other] : [other, subject]
    const result = playCpuMatch(
      {
        players: [
          { garage: first.garage, deck: first.deck },
          { garage: second.garage, deck: second.deck },
        ],
        firstPlayer: 0,
      },
      matchSeed,
      { levels: [level, level] },
    )
    cell.games++
    if (seat === 0) cell.firstGames++
    if (result.winner === seat) cell.wins++
  }
  return cell
}

export function runTypeLab(options: Partial<TypeLabOptions> = {}): TypeLabReport {
  const opts: TypeLabOptions = { ...TYPE_LAB_DEFAULTS, ...options }
  const started = Date.now()
  let master = seedRng(opts.seed)
  const nextSeed = (): number => {
    const [value, next] = nextUint32(master)
    master = next
    return value
  }
  // Every reading's seeds are drawn first and in one order, whether or not the reading plays, so
  // resizing or skipping one leaves every other game exactly as it was.
  const seedsByType = () => new Map(CAR_TYPES.map((type) => [type, nextSeed()] as const))
  const fieldSeeds = seedsByType()
  const tierSeeds = seedsByType()
  const proSeeds = seedsByType()
  const introSeed = nextSeed()

  const field = new Map<CarType, TypeCell>()
  const sameTiers = new Map<CarType, TypeCell>()
  const pro = new Map<CarType, TypeCell>()
  for (const type of CAR_TYPES) {
    const ofType = againstField((rng) => singleTypeGarage(type, rng))
    field.set(type, measure(opts.games, fieldSeeds.get(type) ?? 0, 'street', ofType))
    sameTiers.set(
      type,
      measure(opts.tiered, tierSeeds.get(type) ?? 0, 'street', (rng) => sameTierGarages(type, rng)),
    )
    pro.set(type, measure(opts.pro, proSeeds.get(type) ?? 0, 'pro', ofType))
  }
  const intro = measure(opts.intro, introSeed, 'street', againstField(introGarage))
  return { options: opts, elapsedMs: Date.now() - started, field, sameTiers, pro, intro }
}

// Targets (DESIGN.md section 7)

/** A type target, and whether the reading sits too near an edge to call on these games. */
export interface TypeTarget extends TargetResult {
  close: boolean
}

export function checkTypeTargets(report: TypeLabReport): TypeTarget[] {
  const [low, high] = TUNABLES.sim.typeWin
  return CAR_TYPES.map((type) => {
    const cell = report.field.get(type) ?? EMPTY
    const value = rate(cell)
    const [from, to] = wilson(cell)
    return {
      name: `${CAR_TYPE_LABEL[type]} wins between ${whole(low)} and ${whole(high)} against the field`,
      value: `${tenth(value)} (${range(cell)})`,
      pass: value >= low && value <= high,
      close: from < low || to > high,
    }
  })
}

/** Types whose Pro reading sits outside the band: warnings, not failures (backlog G22). */
export function typeWarnings(report: TypeLabReport): string[] {
  const [low, high] = TUNABLES.sim.typeWin
  return CAR_TYPES.flatMap((type) => {
    const cell = report.pro.get(type) ?? EMPTY
    const value = rate(cell)
    if (cell.games === 0 || (value >= low && value <= high)) return []
    return [
      `${CAR_TYPE_LABEL[type]} wins ${tenth(value)} (${range(cell)}) against the field with the Pro CPU, outside ${whole(low)} to ${whole(high)}`,
    ]
  })
}

// Formatting

function whole(value: number): string {
  return `${Math.round(value * 100)}%`
}

function tenth(value: number): string {
  return Number.isNaN(value) ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function range(t: Tally): string {
  const [from, to] = wilson(t)
  return Number.isNaN(from) ? 'n/a' : `${(from * 100).toFixed(1)}-${(to * 100).toFixed(1)}`
}

function points(value: number): string {
  if (Number.isNaN(value)) return 'n/a'
  return `${value < 0 ? '-' : '+'}${Math.abs(value * 100).toFixed(1)}`
}

function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text
}

export function formatTypeLabReport(report: TypeLabReport): string {
  const { options } = report
  const identity = TUNABLES.typeIdentity
  const lines: string[] = []
  lines.push(
    `Pink Slips type lab: seed ${options.seed}, ${options.games} games a type against the field, ${options.tiered} with the tiers held equal, ${options.pro} with the Pro CPU, ${(report.elapsedMs / 1000).toFixed(1)} s`,
  )
  lines.push(
    `Type tunables: multiplier ${CAR_TYPES.map((type) => `${CAR_TYPE_LABEL[type]} ${TUNABLES.typeDistanceMultiplier[type]}`).join(', ')}; EV launch ${identity.evFirstAdvanceFt} ft; Muscle top end ${identity.muscleTopEndFt} ft from ${identity.muscleTopEndFromFt} ft; Luxury wear x${identity.luxuryWearMultiplier}; JDM slots ${TUNABLES.partSlotsJdm}; fuel by tier ${Object.values(TUNABLES.fuelCostByTier).join('/')}`,
  )

  lines.push(
    '',
    'Each type against the field, Street CPU; range is where the true rate sits, 19 in 20',
  )
  lines.push(
    padEnd('Type', 10) +
      padStart('field', 8) +
      '  ' +
      padEnd('range', 11) +
      padStart('same tiers', 11) +
      padStart('from tiers', 12) +
      padStart('Pro', 8) +
      padStart('Pro-field', 11),
  )
  for (const type of CAR_TYPES) {
    const field = report.field.get(type) ?? EMPTY
    const onField = rate(field)
    const same = rate(report.sameTiers.get(type) ?? EMPTY)
    const pro = rate(report.pro.get(type) ?? EMPTY)
    lines.push(
      padEnd(CAR_TYPE_LABEL[type], 10) +
        padStart(tenth(onField), 8) +
        '  ' +
        padEnd(range(field), 11) +
        padStart(tenth(same), 11) +
        padStart(points(onField - same), 12) +
        padStart(tenth(pro), 8) +
        padStart(points(pro - onField), 11),
    )
  }
  const rates = CAR_TYPES.map((type) => rate(report.field.get(type) ?? EMPTY))
  lines.push(
    `Six-type mean ${tenth(mean(rates))}, from ${tenth(Math.min(...rates))} to ${tenth(Math.max(...rates))}`,
  )
  lines.push(
    '',
    `Intro set against the field: ${tenth(rate(report.intro))} (${range(report.intro)}), ${report.intro.games} games`,
  )

  lines.push('', 'How to read it')
  lines.push(
    '- same tiers: both garages hold the same five tiers, one side all of the type, so this is the',
    "  type's own rules and cars. from tiers: the field reading less this one, the part that comes",
    "  from which tiers the type's cars sit in.",
    '- Pro: the Pro CPU on both sides, which stages the car that needs the fewest turns to finish,',
    "  fueling included. A Pro reading outside the band is a warning: the type's balance depends on",
    '  how its cars are staged (backlog G22). The verdict is the Street reading.',
  )

  lines.push('', 'Targets (DESIGN.md section 7)')
  for (const target of checkTypeTargets(report)) {
    const close = target.close ? '  (close: the range crosses an edge)' : ''
    lines.push(`${target.pass ? 'PASS' : 'FAIL'}  ${target.name}: ${target.value}${close}`)
  }
  const warnings = typeWarnings(report)
  lines.push('', 'Warnings (Pro CPU, backlog G22)')
  lines.push(...(warnings.length > 0 ? warnings.map((warning) => `WARN  ${warning}`) : ['none']))
  return lines.join('\n')
}
