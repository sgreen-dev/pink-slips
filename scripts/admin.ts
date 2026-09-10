/**
 * Removing a player (backlog Q39):
 *
 *   node scripts/admin.ts players                    who is on the leaderboard, with ids
 *   node scripts/admin.ts delete <id>                remove one
 *   node scripts/admin.ts delete-tests               show which smoke-test players would go
 *   node scripts/admin.ts delete-tests --yes         remove them
 *
 * The service refuses these without the secret, and answers 404 rather than 403 when no secret
 * is set at all, so an unconfigured deployment has no admin surface to find. Set it once with
 * `npx wrangler secret put ADMIN_TOKEN` from `server/`, and give it to this script as the
 * environment variable PINK_SLIPS_ADMIN_TOKEN.
 *
 * Deleting is irreversible: the account, its recovery code, its sessions and its place on the
 * leaderboard all go, and no part of it can be recovered afterwards.
 */

const ROOMS = 'https://pink-slips-rooms.pink-slips-counter.workers.dev'

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  const value = at < 0 ? undefined : process.argv[at + 1]
  return (value ?? fallback).replace(/\/+$/, '')
}

const endpoint = arg('rooms', ROOMS)
const token = process.env['PINK_SLIPS_ADMIN_TOKEN'] ?? ''
const command = process.argv[2] ?? ''

/** A smoke-test player: the two names `scripts/online-smoke.ts` makes, and nothing else. */
const TEST_NAME = /^Smoke (Ann|Bo) [A-Z0-9]{4}$/

interface Row {
  id: string
  name: string
  rating: number
  wins: number
  losses: number
}

async function players(): Promise<Row[]> {
  const response = await fetch(`${endpoint}/leaderboard`)
  if (!response.ok) throw new Error(`The leaderboard answered ${response.status}`)
  return (await response.json()) as Row[]
}

async function remove(id: string): Promise<void> {
  if (!token) throw new Error('Set PINK_SLIPS_ADMIN_TOKEN to the secret the service was given.')
  const response = await fetch(`${endpoint}/admin/player?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (response.status === 404) throw new Error(`No such player, or no admin secret is set: ${id}`)
  if (response.status === 403) throw new Error('The admin secret was refused.')
  if (!response.ok) throw new Error(`Deleting ${id} answered ${response.status}`)
  console.log(`deleted ${id}`)
}

function show(rows: readonly Row[]): void {
  for (const row of rows) {
    const record = `${row.wins}-${row.losses}`.padEnd(6)
    console.log(`${row.id}  ${String(row.rating).padStart(5)}  ${record}  ${row.name}`)
  }
}

async function main(): Promise<void> {
  if (command === 'players') {
    const rows = await players()
    show(rows)
    console.log(`\n${rows.length} on the leaderboard`)
    return
  }

  if (command === 'delete') {
    const id = process.argv[3]
    if (!id) throw new Error('Usage: node scripts/admin.ts delete <id>')
    await remove(id)
    return
  }

  if (command === 'delete-tests') {
    const rows = (await players()).filter((row) => TEST_NAME.test(row.name))
    if (rows.length === 0) {
      console.log('No smoke-test players on the leaderboard.')
      return
    }
    show(rows)
    if (!process.argv.includes('--yes')) {
      console.log(`\n${rows.length} would be deleted. Re-run with --yes to do it.`)
      return
    }
    console.log()
    for (const row of rows) await remove(row.id)
    console.log(`\n${rows.length} deleted.`)
    return
  }

  console.error('Usage: node scripts/admin.ts <players|delete <id>|delete-tests [--yes]>')
  process.exit(2)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
