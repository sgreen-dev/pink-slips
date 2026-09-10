/**
 * Stops this repo's local dev servers, whatever port they drifted onto:
 *
 *   npm run dev:stop
 *   npm run dev:stop -- --check     list them and stop nothing
 *
 * Five Vite servers were once found running at once, four of them abandoned from the day before.
 * Vite takes the next free port when the one it wanted is busy, so a second `npm run dev` does
 * not fail, it quietly starts a second server: one stray carried `--port 5173` on its command
 * line and was answering on 5174. `vite.config.ts` now sets `strictPort`, which stops new ones
 * being made, but it can do nothing about the ones already running. This is that half.
 *
 * It looks at command lines rather than at a port, because a stray is on a port nobody chose and
 * not knowing which port is the whole problem. A Vite server has to carry both this repo's path
 * and Vite's own entry file, which is what keeps `npm run test:watch` out of it: vitest lives at
 * `node_modules/vitest/vitest.mjs`, so anything matching the bare word "vite" would stop the
 * test watcher too.
 *
 * `python -m http.server`, which the art scripts use to look at `public/`, is covered on the
 * same terms. It was added after one sat on a port for most of a day: this script had reported
 * a clean machine each time, truthfully, because it only ever looked at node and workerd. A
 * cleanup tool that is narrower than the problem reads exactly like one that has nothing to do.
 *
 * `wrangler dev` and the `workerd` it runs are covered with one caveat the output states out
 * loud: neither carries a repo path, because wrangler is resolved from the npx cache and
 * workerd is handed its config on stdin, so those two are matched by which program they are
 * rather than by whose they are. The parent goes first, since stopping `workerd` alone achieves
 * nothing -- wrangler notices and starts another, and the giveaway is the pid changing between
 * two looks. That is also why everything is listed again afterwards instead of the old pids
 * being asked whether they are still alive: a replacement comes back under a new pid, and the
 * old one answering "no such process" would read as success.
 */

import { execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

/** Long enough for a supervisor to let go of its child, short enough not to feel hung. */
const GIVE_UP_AFTER_MS = 5_000
const LOOK_AGAIN_EVERY_MS = 250

/** Backslashes to slashes and lower case, so one spelling of a path is compared against another. */
function plain(text: string): string {
  return text.replace(/\\/g, '/').toLowerCase()
}

/** This repo's root, in the shape a command line carries it. */
const ROOT = plain(fileURLToPath(new URL('..', import.meta.url))).replace(/\/+$/, '')

interface Row {
  pid: number
  parent: number
  command: string
}

interface Target extends Row {
  name: string
  /** False for wrangler and workerd, whose command lines cannot prove which repo they serve. */
  repoScoped: boolean
}

/**
 * Every process that could be one of ours, with its parent and command line. python is here for
 * `python -m http.server`, which the art scripts use to look at `public/` and which had been
 * sitting on a port for hours before anyone noticed. The filter is on the program name and never
 * on this repo's path: a path in the query would put it on the probe's own command line, and the
 * script would go on to find itself.
 */
const NAMES = ["'node.exe'", "'workerd.exe'", "'python.exe'", "'pythonw.exe'"]
const PROBE = [
  '$p = @(Get-CimInstance Win32_Process |',
  `  Where-Object { ${NAMES.map((n) => `$_.Name -eq ${n}`).join(' -or ')} } |`,
  '  Select-Object ProcessId, ParentProcessId, CommandLine)',
  'ConvertTo-Json -Depth 3 -Compress -InputObject $p',
].join('\n')

function look(): Row[] {
  return process.platform === 'win32' ? fromWindows() : fromPosix()
}

function fromWindows(): Row[] {
  // -InputObject @(...) rather than a pipeline: a pipeline hands back a bare object for one row
  // and nothing at all for none, so the JSON shape would change with the number of results.
  const out = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PROBE])
  // PowerShell 5 writes a byte-order mark to a redirected stdout, which JSON.parse will not take.
  const text = out.replace(/^\uFEFF/, '').trim()
  if (text === '') return []
  const rows = JSON.parse(text) as {
    ProcessId?: number
    ParentProcessId?: number
    CommandLine?: string | null
  }[]
  return rows
    .filter((row) => row.CommandLine)
    .map((row) => ({
      pid: Number(row.ProcessId ?? 0),
      parent: Number(row.ParentProcessId ?? 0),
      command: row.CommandLine ?? '',
    }))
}

function fromPosix(): Row[] {
  // -ww so a long command line is not cut to the terminal width, which macOS does by default and
  // would hide the very path this matches on. Untested: the only machine this has run on is
  // Windows.
  const out = run('ps', ['-ww', '-eo', 'pid=,ppid=,args='])
  const rows: Row[] = []
  for (const line of out.split('\n')) {
    const found = /^\s*(\d+)\s+(\d+)\s+(.+)$/.exec(line)
    if (found) {
      rows.push({
        pid: Number(found[1] ?? ''),
        parent: Number(found[2] ?? ''),
        command: (found[3] ?? '').trim(),
      })
    }
  }
  return rows
}

/**
 * No shell, unlike the `npx` calls in `scripts/deploy-worker.ts`: `powershell.exe` and `ps` are
 * real executables, so nothing here is handed to a command interpreter on the way.
 */
function run(file: string, args: string[]): string {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    })
  } catch (error) {
    const failed = error as NodeJS.ErrnoException
    const why = failed.code === 'ENOENT' ? `${file} would not start` : failed.message
    throw new Error(`Could not list processes: ${why}`, { cause: error })
  }
}

/**
 * Vite has to carry both the repo and Vite's entry file. npm's Windows shim spells the way there
 * as `node_modules\.bin\\..\vite\bin\vite.js`, so the entry is matched loosely and the repo is
 * proved separately. The trailing slash on the root matters: without it a sibling checkout in
 * `pink-slips-old` would read as this one.
 */
function nameFor(command: string): { name: string; repoScoped: boolean } | null {
  const text = plain(command)
  if (text.includes(`${ROOT}/`) && /\/vite\/bin\/vite\.js\b/.test(text)) {
    return {
      name: text.split(/\s+/).includes('preview') ? 'vite preview' : 'vite dev',
      repoScoped: true,
    }
  }
  const words = text.split(/\s+/)
  // `dev` as a whole word, so `wrangler deploy` mid-flight is never mistaken for a dev server.
  if (text.includes('/wrangler/') && words.includes('dev')) {
    return { name: 'wrangler dev', repoScoped: false }
  }
  if (/\/workerd(\.exe)?\b/.test(text) && words.includes('serve')) {
    return { name: 'workerd', repoScoped: false }
  }
  // Python's own static server, used by hand to look at `public/`. Unlike wrangler this one can
  // be proved ours: it runs from the art venv inside the repo, so its interpreter path carries
  // the root. Requiring that as well as `http.server` leaves another checkout's alone.
  if (text.includes(`${ROOT}/`) && text.includes('http.server')) {
    return { name: 'http.server', repoScoped: true }
  }
  return null
}

/** This process and everything that started it, so the script cannot reach up its own chain. */
function ancestry(rows: readonly Row[]): Set<number> {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const mine = new Set([process.pid])
  let next = byPid.get(byPid.get(process.pid)?.parent ?? -1)
  while (next && !mine.has(next.pid)) {
    mine.add(next.pid)
    next = byPid.get(next.parent)
  }
  return mine
}

function targets(rows: readonly Row[]): Target[] {
  const mine = ancestry(rows)
  const found: Target[] = []
  for (const row of rows) {
    if (mine.has(row.pid)) continue
    const named = nameFor(row.command)
    if (named) found.push({ ...row, ...named })
  }
  return parentsFirst(found, rows)
}

/**
 * A supervisor before whatever it supervises, worked out from the tree rather than hardcoded, so
 * nothing is started again behind us.
 */
function parentsFirst(found: Target[], rows: readonly Row[]): Target[] {
  const byPid = new Map(rows.map((row) => [row.pid, row]))
  const wanted = new Set(found.map((target) => target.pid))
  const depth = new Map<number, number>()
  for (const target of found) {
    let count = 0
    // Windows pids 0 and 4 point at each other, so the walk needs a way out.
    const seen = new Set([target.pid])
    let next = byPid.get(target.parent)
    while (next && !seen.has(next.pid)) {
      seen.add(next.pid)
      if (wanted.has(next.pid)) count += 1
      next = byPid.get(next.parent)
    }
    depth.set(target.pid, count)
  }
  return [...found].sort((a, b) => (depth.get(a.pid) ?? 0) - (depth.get(b.pid) ?? 0))
}

function describe(target: Target): string {
  return `  ${target.name.padEnd(14)}pid ${target.pid}`
}

function stop(pid: number, signal: NodeJS.Signals): 'denied' | 'done' {
  try {
    process.kill(pid, signal)
    return 'done'
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // Gone between the look and the kill is the outcome we wanted anyway.
    if (code === 'ESRCH') return 'done'
    if (code === 'EPERM') return 'denied'
    throw error
  }
}

async function main(): Promise<void> {
  const unknown = process.argv.slice(2).filter((flag) => flag !== '--check')
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0] ?? ''}`)
    console.error('Usage: node scripts/dev-stop.ts [--check]')
    process.exit(2)
  }

  let running = targets(look())
  if (running.length === 0) {
    console.log('No dev servers of this repo are running.')
    return
  }

  const started = running.length
  for (const target of running) console.log(describe(target))
  if (running.some((target) => !target.repoScoped)) {
    console.log(
      '\n  wrangler and workerd carry no path, so those are matched by program, not by repo.',
    )
  }

  if (process.argv.includes('--check')) {
    console.log(`\n${started} running. Run \`npm run dev:stop\` to stop them.`)
    return
  }

  console.log()
  let denied = false
  // Windows has no signal concept -- every one of these is the same forceful stop -- so wrangler
  // never runs its cleanup there and workerd has to be taken separately. On POSIX the second
  // pass is a real escalation.
  let signal: NodeJS.Signals = 'SIGTERM'
  const until = Date.now() + GIVE_UP_AFTER_MS
  for (;;) {
    for (const target of running) {
      if (stop(target.pid, signal) === 'denied') {
        denied = true
        console.error(`Not allowed to stop pid ${target.pid}.`)
      }
    }
    await sleep(LOOK_AGAIN_EVERY_MS)
    running = targets(look())
    if (running.length === 0 || Date.now() >= until) break
    signal = 'SIGKILL'
  }

  if (running.length > 0) {
    console.error(`Still running after ${GIVE_UP_AFTER_MS / 1000}s:`)
    for (const target of running) console.error(describe(target))
    if (denied) console.error('\nRun this from the account that started them.')
    process.exit(1)
  }

  console.log(`Stopped ${started}.`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
