/**
 * Reads the crash reports players' browsers have sent (backlog Q38):
 *
 *   npm run errors
 *   npm run errors -- --clear     empties the store once they are dealt with
 *
 * They live in the counter worker's KV namespace, not on a public route, because a stack trace
 * is for whoever is fixing the bug rather than for anyone who asks. Reading needs the same
 * Cloudflare login `wrangler deploy` does.
 */

import { execFileSync } from 'node:child_process'

const clear = process.argv.includes('--clear')

interface ExecFailure {
  status?: number | null
  code?: string
  stderr?: string
}

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: 'counter',
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
}

/** A key nobody has written yet is an empty store. Anything else wrangler says is a fault. */
function isMissingKey(error: unknown): boolean {
  const said = (error as ExecFailure).stderr ?? ''
  // wrangler 4 reports a missing key as a bare 404 on the value URL; older versions named it.
  // Scoped to /values/ so a missing namespace, which 404s on a different path, stays a fault.
  return /key not found|10009/i.test(said) || /\/values\/\S* - 404\b/.test(said)
}

/** Repeats what wrangler said, so a login or a path problem cannot read as "nothing stored". */
function bail(action: string, error: unknown): never {
  const failure = error as ExecFailure
  console.error(`Could not ${action}.`)
  if (failure.code === 'ENOENT') {
    console.error('  npx would not start, or counter/ is not below the directory this ran from.')
    console.error('  Run it as `npm run errors`, which works anywhere in the repo.')
  }
  const said = failure.stderr?.trim()
  if (said !== undefined && said !== '') {
    for (const line of said.split('\n')) console.error(`  ${line}`)
    console.error('\nIf that is a login problem: npx wrangler login')
  } else if (typeof failure.status === 'number') {
    console.error(`  wrangler exited ${failure.status} and said nothing.`)
  }
  process.exit(1)
}

interface Report {
  message: string
  stack: string
  commit: string
  at: number
}

if (clear) {
  try {
    wrangler(['kv', 'key', 'delete', 'errors', '--binding', 'COUNTS', '--remote'])
  } catch (error) {
    if (isMissingKey(error)) {
      console.log('Nothing to clear.')
      process.exit(0)
    }
    bail('clear the crash reports', error)
  }
  console.log('Cleared.')
  process.exit(0)
}

let raw = ''
try {
  raw = wrangler(['kv', 'key', 'get', 'errors', '--binding', 'COUNTS', '--remote'])
} catch (error) {
  if (isMissingKey(error)) {
    console.log('No crash reports stored.')
    process.exit(0)
  }
  bail('read the crash reports', error)
}

if (raw.trim() === '') {
  console.log('No crash reports stored.')
  process.exit(0)
}

let reports: Report[] = []
try {
  const parsed: unknown = JSON.parse(raw.trim())
  if (Array.isArray(parsed)) reports = parsed as Report[]
} catch {
  console.error('The stored value was not a list of reports:')
  console.error(raw.slice(0, 400))
  process.exit(1)
}

if (reports.length === 0) {
  console.log('No crash reports stored.')
  process.exit(0)
}

console.log(`${reports.length} crash report${reports.length === 1 ? '' : 's'}, newest first\n`)
for (const report of reports) {
  const when = new Date(report.at).toISOString().replace('T', ' ').slice(0, 19)
  console.log(`${when}  ${report.commit || 'unknown commit'}`)
  console.log(`  ${report.message}`)
  for (const line of report.stack.split('\n').slice(0, 6)) {
    if (line.trim() !== '') console.log(`    ${line.trim()}`)
  }
  console.log()
}
