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

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: 'counter',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

interface Report {
  message: string
  stack: string
  commit: string
  at: number
}

if (clear) {
  wrangler(['kv', 'key', 'delete', 'errors', '--binding', 'COUNTS', '--remote'])
  console.log('Cleared.')
  process.exit(0)
}

let raw = ''
try {
  raw = wrangler(['kv', 'key', 'get', 'errors', '--binding', 'COUNTS', '--remote'])
} catch {
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
