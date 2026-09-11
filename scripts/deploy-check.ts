/**
 * Checks that every deployed part of the game is up (docs/deploy.md):
 *
 *   node scripts/deploy-check.ts
 *   node scripts/deploy-check.ts --rooms http://localhost:8787 --skip-counter
 *   node scripts/deploy-check.ts --expect <commit>     (the deploy workflow, after Pages)
 *
 * Read-only: it fetches a page and a few GET routes, makes no players, opens no rooms, and adds
 * nothing to the count, so it is safe to run as often as you like.
 *
 * It reports what is up *and* what each part was built from. The site writes its commit into
 * `version.json` at build time and each worker answers `/version` with the one
 * `scripts/deploy-worker.ts` stamped, so a site running against a worker that was never
 * redeployed is now something this can say out loud rather than something you find out from a
 * player (backlog Q36).
 *
 * `--expect` is the deploy workflow's run (backlog Q42). It waits for the site to serve that
 * commit, then asks a narrower question than "all on one commit": whether each worker holds every
 * change to its own code up to it. A push that changed only the site passes; a worker left behind
 * a change it bundles fails the run.
 */

import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

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

/**
 * What each worker is built from, for `--expect`: a change under any of these paths needs that
 * worker deployed again. Tests and the test stand-in are left out, since no worker bundles them.
 * A path here that a worker does not really use costs a false alarm, never a miss.
 */
const SOURCES: Record<string, readonly string[]> = {
  rooms: ['server', 'src/server', 'src/protocol', 'src/engine', 'src/collection', 'src/data'],
  counter: ['counter', 'src/server/http.ts'],
}
const UNBUNDLED = [
  ':(exclude,glob)**/*.test.ts',
  ':(exclude)server/testing.ts',
  ':(exclude)src/engine/test-helpers.ts',
]

/** How long to wait for Pages to change over to a new build, and how often to look. */
const SITE_WAIT_MS = 5 * 60_000
const SITE_POLL_MS = 10_000

/** `--expect <commit>`, or null when the check is run by hand. */
function expectedCommit(): string | null {
  const at = process.argv.indexOf('--expect')
  if (at < 0) return null
  const value = process.argv[at + 1] ?? ''
  if (!/^[0-9a-f]{7,40}$/.test(value)) throw new Error('--expect takes a commit hash')
  return value
}

/** Waits for the site to serve `commit`. The query string steps around any cached copy. */
async function siteServes(commit: string): Promise<boolean> {
  const until = Date.now() + SITE_WAIT_MS
  for (;;) {
    const served = await commitOf(`${arg('site', SITE)}/version.json?at=${Date.now()}`)
    if (served !== null && commit.startsWith(served)) return true
    if (Date.now() >= until) return false
    await sleep(SITE_POLL_MS)
  }
}

/** The newest commit up to `commit` that changed what a worker is built from, or null. */
function lastChange(worker: string, commit: string): string | null {
  const paths = SOURCES[worker] ?? []
  const args = ['log', '-1', '--format=%h', commit, '--', ...paths, ...UNBUNDLED]
  const found = execFileSync('git', args, { encoding: 'utf8' }).trim()
  return found === '' ? null : found
}

/** Whether `deployed` holds `change`, being it or coming after it; null when git does not know. */
function holds(deployed: string, change: string): boolean | null {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', change, deployed], { stdio: 'ignore' })
    return true
  } catch (error) {
    // 1 is "not an ancestor"; anything else is a commit this clone does not have.
    return (error as { status?: number }).status === 1 ? false : null
  }
}

/**
 * The `--expect` verdict. A worker behind a change to its own code is the mismatch a player
 * would otherwise be the first to find; a worker on an older commit that changed nothing of its
 * own is fine, and is not failed.
 */
function verify(checks: readonly Check[], commit: string): void {
  const behind: string[] = []
  for (const check of checks) {
    if (check.name === 'site') continue
    const change = lastChange(check.name, commit)
    if (change === null) continue
    const current = check.commit === null ? null : holds(check.commit, change)
    const verdict =
      current === true
        ? 'holds it'
        : current === false
          ? `is on ${check.commit ?? ''}, without it`
          : `is on ${check.commit ?? 'an unstamped build'}, which git here does not know`
    console.log(`${check.name.padEnd(8)} last changed in ${change}; the live worker ${verdict}`)
    if (current !== true) behind.push(check.name)
  }
  if (behind.length > 0) {
    throw new Error(`Deploy again: ${behind.map((name) => `npm run deploy:${name}`).join(', ')}`)
  }
  console.log(`Every worker holds every change to its own code up to ${commit.slice(0, 7)}`)
}

async function main(): Promise<void> {
  const expected = expectedCommit()
  if (expected !== null && !(await siteServes(expected))) {
    throw new Error(`The site is still not serving ${expected.slice(0, 7)}`)
  }
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
  if (expected !== null) return verify(checks, expected)
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
