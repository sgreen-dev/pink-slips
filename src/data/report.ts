/**
 * Prints the tier-by-type roster grid with counts, then the cars in each cell.
 * Run with `npm run data:report`.
 */
import { CARS } from './cars.ts'
import { TIER_LABEL, powerToWeight } from './tiers.ts'
import { CAR_TYPES, CAR_TYPE_LABEL, TIERS, type CarType, type Tier } from './types.ts'

function cell(type: CarType, tier: Tier) {
  return CARS.filter((car) => car.type === type && car.tier === tier)
}

function padEnd(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - text.length))
}

function padStart(text: string, width: number): string {
  return ' '.repeat(Math.max(0, width - text.length)) + text
}

const rowLabelWidth = 22
const colWidth = 10
const lines: string[] = []

lines.push(`Pink Slips roster: ${CARS.length} cars`)
lines.push('')

const header = [
  padEnd('Tier', rowLabelWidth),
  ...CAR_TYPES.map((type) => padStart(CAR_TYPE_LABEL[type], colWidth)),
  padStart('Total', colWidth),
]
lines.push(header.join(''))
lines.push('-'.repeat(rowLabelWidth + colWidth * (CAR_TYPES.length + 1)))

for (const tier of TIERS) {
  const counts = CAR_TYPES.map((type) => cell(type, tier).length)
  const total = counts.reduce((sum, n) => sum + n, 0)
  lines.push(
    [
      padEnd(`${TIER_LABEL[tier]} (${tier})`, rowLabelWidth),
      ...counts.map((n) => padStart(String(n), colWidth)),
      padStart(String(total), colWidth),
    ].join(''),
  )
}

const typeTotals = CAR_TYPES.map((type) => CARS.filter((car) => car.type === type).length)
lines.push('-'.repeat(rowLabelWidth + colWidth * (CAR_TYPES.length + 1)))
lines.push(
  [
    padEnd('Total', rowLabelWidth),
    ...typeTotals.map((n) => padStart(String(n), colWidth)),
    padStart(String(CARS.length), colWidth),
  ].join(''),
)

lines.push('')
lines.push('Cars by cell (hp/lb in parentheses, * marks a judgment placement):')
for (const type of CAR_TYPES) {
  for (const tier of TIERS) {
    const cars = cell(type, tier)
    if (cars.length === 0) continue
    const names = cars
      .map(
        (car) =>
          `${car.name} (${powerToWeight(car.hp, car.weightLb).toFixed(3)}${car.tierNote ? '*' : ''})`,
      )
      .join(', ')
    lines.push(`  ${CAR_TYPE_LABEL[type]} / ${TIER_LABEL[tier]}: ${names}`)
  }
}

console.log(lines.join('\n'))
