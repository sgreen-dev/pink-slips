/**
 * Checks that every deployed part of the game is up (docs/deploy.md):
 *
 *   node scripts/deploy-check.ts
 *   node scripts/deploy-check.ts --rooms http://localhost:8787 --skip-counter
 *
 * Read-only: it fetches a page and a few GET routes, makes no players, opens no rooms, and adds
 * nothing to the count, so it is safe to run as often as you like.
 *
 * It reports what is up *and* what each part was built from. The site writes its commit into
 * `version.json` at build time and each worker answers `/version` with the one
 * `scripts/deploy-worker.ts` stamped, so a site running against a worker that was never
 * redeployed is now something this can say out loud rather than something you find out from a
 * player (backlog Q36).
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
  /** What the check found: a row count, the match count. */
  detail: string
  up: boolean
  /** The commit this part was built from, or null when it does not say. */
  commit: string | null
}

/** A `/version` route, for a part that has one. Never fatal: an older deployment has none. */
async function commitOf(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const body = (await response.json()) as { commit?: unknown }
    return typeof body.commit === 'string' ? body.commit : null
  } catch {
    return null
  }
}

/** The site: up when it serves its HTML, with the bundle name as a build fingerprint. */
async function checkSite(url: string): Promise<Check> {
  const base = { name: 'site', url }
  try {
    const response = await fetch(`${url}/`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false, commit: null }
    const html = await response.text()
    const bundle = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1]
    if (!bundle) return { ...base, detail: 'no bundle in the HTML', up: false, commit: null }
    return { ...base, detail: bundle, up: true, commit: await commitOf(`${url}/version.json`) }
  } catch (error) {
    return { ...base, detail: message(error), up: false, commit: null }
  }
}

/** The room worker: up when the leaderboard answers, which touches nothing. */
async function checkRooms(url: string): Promise<Check> {
  const base = { name: 'rooms', url }
  try {
    const response = await fetch(`${url}/leaderboard`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false, commit: null }
    const board: unknown = await response.json()
    if (!Array.isArray(board)) {
      return { ...base, detail: 'leaderboard was not a list', up: false, commit: null }
    }
    return {
      ...base,
      detail: `${board.length} rated players`,
      up: true,
      commit: await commitOf(`${url}/version`),
    }
  } catch (error) {
    return { ...base, detail: message(error), up: false, commit: null }
  }
}

/** The counter: up when GET gives back the number. A POST would add one, so this never posts. */
async function checkCounter(url: string): Promise<Check> {
  const base = { name: 'counter', url }
  try {
    const response = await fetch(`${url}/`)
    if (!response.ok) return { ...base, detail: `HTTP ${response.status}`, up: false, commit: null }
    const body = (await response.json()) as { count?: unknown }
    if (typeof body.count !== 'number')
      return { ...base, detail: 'no count', up: false, commit: null }
    return {
      ...base,
      detail: `${body.count} matches raced`,
      up: true,
      commit: await commitOf(`${url}/version`),
    }
  } catch (error) {
    return { ...base, detail: message(error), up: false, commit: null }
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
    const from = (check.commit ?? 'no version route').padEnd(16)
    console.log(`${check.name.padEnd(8)} ${state}  ${from} ${check.detail.padEnd(24)} ${check.url}`)
  }
  if (skipCounter) console.log('counter  skipped')
  const down = checks.filter((check) => !check.up)
  if (down.length > 0) {
    throw new Error(`Not running: ${down.map((check) => check.name).join(', ')}`)
  }
  // Being up is not the same as being current. A part with no version route is not counted
  // against the others, since it simply predates them saying so.
  const stamped = checks.filter((check) => check.commit !== null)
  const commits = new Set(stamped.map((check) => check.commit))
  if (commits.size > 1) {
    const list = stamped.map((check) => `${check.name} ${check.commit ?? ''}`).join(', ')
    throw new Error(`Deployed parts are on different commits: ${list}`)
  }
  const missing = checks.filter((check) => check.commit === null).map((check) => check.name)
  if (missing.length > 0) {
    console.log(`No version route yet, so not compared: ${missing.join(', ')}`)
  }
  console.log(
    commits.size === 1
      ? `Every deployed part answered, all on ${[...commits][0] ?? ''}`
      : 'Every deployed part answered',
  )
}

main().catch((error: unknown) => {
  console.error(message(error))
  process.exit(1)
})
