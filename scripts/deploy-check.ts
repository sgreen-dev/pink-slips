/**
 * Checks that every deployed part of the game is up (docs/deploy.md):
 *
 *   node scripts/deploy-check.ts
 *   node scripts/deploy-check.ts --rooms http://localhost:8787 --skip-counter
 *
 * Read-only: it fetches a page and two GET routes, makes no players, opens no rooms, and adds
 * nothing to the count, so it is safe to run as often as you like. It reports what is *up*, not
 * what is *current*: neither worker says which commit it is running, so deploying the site and
 * the room worker together every time is what keeps them in step, not this script.
 */

const SITE = 'https://sgreen-dev.github.io/pink-slips/'
const ROOMS = 'https://pink-slips-rooms.pink-slips-counter.workers.dev'
const COUNTER = 'https://pink-slips-counter.pink-slips-counter.workers.dev'

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  const value = at < 0 ? undefined : process.argv[at + 1]
  return (value ?? fallback).replace(/\/+$/, '')
}

const skipCounter = process.argv.includes('--skip-counter')

interface Check {
  name: string
  url: string
  /** What the check found: a build fingerprint, a row count, the match count. */
  detail: string
  up: boolean
}

/** The site: up when it serves its HTML, with the bundle name as a build fingerprint. */
async function checkSite(url: string): Promise<Check> {
  const base = { name: 'site', url }
  try {
    const response = await fetch(`${url}/`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false }
    const html = await response.text()
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1]
    if (!bundle) return { ...base, detail: 'no bundle in the HTML', up: false }
    return { ...base, detail: bundle, up: true }
  } catch (error) {
    return { ...base, detail: message(error), up: false }
  }
}

/** The room worker: up when the leaderboard answers, which touches nothing. */
async function checkRooms(url: string): Promise<Check> {
  const base = { name: 'rooms', url }
  try {
    const response = await fetch(`${url}/leaderboard`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false }
    const board: unknown = await response.json()
    if (!Array.isArray(board)) return { ...base, detail: 'leaderboard was not a list', up: false }
    return { ...base, detail: `${board.length} rated players`, up: true }
  } catch (error) {
    return { ...base, detail: message(error), up: false }
  }
}

/** The counter: up when GET gives back the number. A POST would add one, so this never posts. */
async function checkCounter(url: string): Promise<Check> {
  const base = { name: 'counter', url }
  try {
    const response = await fetch(`${url}/`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false }
    const body = (await response.json()) as { count?: unknown }
    if (typeof body.count !== 'number') return { ...base, detail: 'no count', up: false }
    return { ...base, detail: `${body.count} matches raced`, up: true }
  } catch (error) {
    return { ...base, detail: message(error), up: false }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const checks = [
    await checkSite(arg('site', SITE)),
    await checkRooms(arg('rooms', ROOMS)),
    ...(skipCounter ? [] : [await checkCounter(arg('counter', COUNTER))]),
  ]
  for (const check of checks) {
    const state = check.up ? 'up  ' : 'DOWN'
    console.log(`${check.name.padEnd(8)} ${state}  ${check.detail.padEnd(24)} ${check.url}`)
  }
  if (skipCounter) console.log('counter  skipped')
  const down = checks.filter((check) => !check.up)
  if (down.length > 0) {
    throw new Error(`Not running: ${down.map((check) => check.name).join(', ')}`)
  }
  console.log('Every deployed part answered')
}

main().catch((error: unknown) => {
  console.error(message(error))
  process.exit(1)
})
