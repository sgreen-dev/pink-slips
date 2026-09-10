/**
 * How many people are playing (backlog Q40):
 *
 *   npm run stats                 the last 30 days
 *   npm run stats -- --days 7     a shorter window
 *
 * There is no public route for this. It needs the same ADMIN_TOKEN the service was given, as
 * PINK_SLIPS_ADMIN_TOKEN, because who plays a game is the owner's business and nobody else's.
 *
 * Every number here counts **browsers**, not people. Clearing site data, a private window or a
 * second device each read as new, and a shared laptop reads as one. A browser that asks not to
 * be tracked is not counted at all, so the real figure is this or a little higher.
 */

const ROOMS = 'https://pink-slips-rooms.pink-slips-counter.workers.dev'

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  const value = at < 0 ? undefined : process.argv[at + 1]
  return (value ?? fallback).replace(/\/+$/, '')
}

const endpoint = arg('rooms', ROOMS)
const days = Number(arg('days', '30'))
const token = process.env['PINK_SLIPS_ADMIN_TOKEN'] ?? ''

interface DayCounts {
  day: string
  visitors: number
  newVisitors: number
  events: Record<string, number>
}

interface Report {
  days: DayCounts[]
  actives: { day: number; week: number; month: number }
  returningShare: number
}

async function main(): Promise<void> {
  if (!token) throw new Error('Set PINK_SLIPS_ADMIN_TOKEN to the secret the service was given.')
  const response = await fetch(`${endpoint}/admin/stats?days=${days}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 404) throw new Error('No admin secret is set on this deployment.')
  if (response.status === 403) throw new Error('The admin secret was refused.')
  if (!response.ok) throw new Error(`The report answered ${response.status}`)
  const report = (await response.json()) as Report

  const { day, week, month } = report.actives
  console.log('Browsers that played')
  console.log(`  today        ${day}`)
  console.log(`  last 7 days  ${week}`)
  console.log(`  last 30 days ${month}`)
  console.log(`  came back on another day  ${Math.round(report.returningShare * 100)}%`)

  if (report.days.length === 0) {
    console.log('\nNothing counted yet.')
    return
  }

  console.log('\nBy day')
  console.log('  day         browsers  new   matches started  finished')
  for (const row of report.days) {
    const started =
      (row.events['match-start-cpu'] ?? 0) +
      (row.events['match-start-hotseat'] ?? 0) +
      (row.events['match-start-online'] ?? 0)
    const finished =
      (row.events['match-finish-cpu'] ?? 0) +
      (row.events['match-finish-hotseat'] ?? 0) +
      (row.events['match-finish-online'] ?? 0)
    console.log(
      `  ${row.day}  ${String(row.visitors).padStart(8)}  ${String(row.newVisitors).padStart(3)}` +
        `   ${String(started).padStart(15)}  ${String(finished).padStart(8)}`,
    )
  }

  const totals: Record<string, number> = {}
  for (const row of report.days) {
    for (const [name, n] of Object.entries(row.events)) totals[name] = (totals[name] ?? 0) + n
  }
  const phone = totals['screen-phone'] ?? 0
  const desktop = totals['screen-desktop'] ?? 0
  if (phone + desktop > 0) {
    console.log(`\nOn a phone: ${Math.round((phone / (phone + desktop)) * 100)}% of visits`)
  }

  console.log('\nEverything counted, over the window')
  for (const [name, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name.padEnd(22)} ${n}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
