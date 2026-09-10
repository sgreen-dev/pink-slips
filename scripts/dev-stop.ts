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
 * not knowing which port is the whole problem.
 *
 * **The rule is open by design, and it did not start that way.** The first version matched a list
 * of tools -- vite, then wrangler and workerd, then http.server -- and a list of tools can only
 * ever find what somebody remembered to add. A static file server held a port for most of a day
 * while this script reported a clean machine every time it was asked, truthfully, because Python
 * was not on the list. A cleanup tool narrower than the problem reads exactly like one with
 * nothing to do, and that is worse than having no tool, because it turns "I do not know" into a
 * confident wrong answer.
 *
 * So the match is now: anything running in one of our RUNTIMES whose command line names this
 * repo, whatever tool it happens to be. New kind of server, new library, does not matter. It is
 * still a list of runtimes rather than "any process under the repo", and that is deliberate --
 * an editor with the folder open carries the repo path too, and the cost of a wrong match is
 * killing someone's editor. Two things are carved back out by shape: vitest, because a watcher
 * is not a stray, and this script itself.
 *
 * The second half is the cross-check. Anything sitting on a port this repo serves on that the
 * rules did not claim is printed too, and never stopped -- it is as likely to be another project
 * as ours. Its whole job is to stop the script being able to imply a clean machine while one of
 * our ports is held, which is the exact way it was wrong before.
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

/**
 * The runtimes this repo starts things in. This is the list that matters: it is what makes the
 * match open rather than closed. Naming *tools* -- vite, wrangler, http.server -- meant every new
 * kind of server was invisible until someone thought to add it, which is how a static file server
 * held a port for most of a day while this script reported a clean machine. Naming runtimes
 * instead catches whatever is run in one of them, tool unknown.
 *
 * It is still a list rather than "anything under the repo", and deliberately: an editor with the
 * folder open can carry the repo path on its command line too, and the cost of a wrong match here
 * is killing someone's editor. Restricting the kill to a runtime we launch keeps that impossible.
 */
const RUNTIMES = ['node', 'python', 'pythonw', 'deno', 'bun']

/** Ports this repo is known to serve on, for the cross-check that only ever reports. */
const OUR_PORTS = [4173, 4300, 5173, 8787]

interface Row {
  pid: number
  parent: number
  command: string
  /** The program itself, lower case and without .exe, so it can be matched against RUNTIMES. */
  image: string
  /** TCP ports this process is listening on. Windows only; empty elsewhere. */
  ports: number[]
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
const PROBE = [
  '$p = @(Get-CimInstance Win32_Process |',
  '  Select-Object ProcessId, ParentProcessId, Name, CommandLine)',
  '$l = @()',
  'try {',
  '  $l = @(Get-NetTCPConnection -State Listen |',
  '    Select-Object LocalPort, OwningProcess)',
  '} catch {}',
  'ConvertTo-Json -Depth 3 -Compress -InputObject @{ processes = $p; listening = $l }',
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
  const parsed = JSON.parse(text) as {
    processes?: {
      ProcessId?: number
      ParentProcessId?: number
      Name?: string | null
      CommandLine?: string | null
    }[]
    listening?: { LocalPort?: number; OwningProcess?: number }[]
  }
  const ports = new Map<number, number[]>()
  for (const one of parsed.listening ?? []) {
    const pid = Number(one.OwningProcess ?? 0)
    const port = Number(one.LocalPort ?? 0)
    if (pid === 0 || port === 0) continue
    // The same port arrives twice when something is bound on both IPv4 and IPv6.
    const held = ports.get(pid) ?? []
    if (!held.includes(port)) held.push(port)
    ports.set(pid, held)
  }
  const rows = parsed.processes ?? []
  return rows
    .filter((row) => row.CommandLine)
    .map((row) => {
      const pid = Number(row.ProcessId ?? 0)
      return {
        pid,
        parent: Number(row.ParentProcessId ?? 0),
        command: row.CommandLine ?? '',
        image: (row.Name ?? '').toLowerCase().replace(/\.exe$/, ''),
        ports: ports.get(pid) ?? [],
      }
    })
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
      const command = (found[3] ?? '').trim()
      rows.push({
        pid: Number(found[1] ?? ''),
        parent: Number(found[2] ?? ''),
        command,
        // argv[0]'s basename, which is the closest `ps` gets to an image name.
        image: (plain(command).split(/\s+/)[0] ?? '').split('/').pop() ?? '',
        // Listening ports would need lsof, which is not always installed; the port cross-check
        // is Windows-only and its absence only costs the extra warning, never a missed kill.
        ports: [],
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
function nameFor(row: Row): { name: string; repoScoped: boolean } | null {
  const text = plain(row.command)
  const words = text.split(/\s+/)

  // The open rule. Anything run in one of our runtimes whose command line names this repo is
  // ours, whatever tool it happens to be. The trailing slash on the root matters: without it a
  // sibling checkout in `pink-slips-old` would read as this one.
  if (RUNTIMES.includes(row.image) && text.includes(`${ROOT}/`)) {
    // `npm run test:watch` is a node process under this repo and must survive: vitest lives at
    // `node_modules/vitest/vitest.mjs`, and a watcher is not a stray.
    if (/\/vitest\//.test(text)) return null
    // This script and its own probe are excluded by pid elsewhere; skip them by shape too, so a
    // second copy started by hand cannot stop the first mid-run.
    if (text.includes('dev-stop.ts')) return null
    return { name: labelFor(text), repoScoped: true }
  }

  // The two that carry no repo path at all: wrangler resolves from the npx cache and workerd is
  // handed its config on stdin, so these stay matched by which program they are.
  // `dev` as a whole word, so `wrangler deploy` mid-flight is never mistaken for a dev server.
  if (text.includes('/wrangler/') && words.includes('dev')) {
    return { name: 'wrangler dev', repoScoped: false }
  }
  if (/\/workerd(\.exe)?\b/.test(text) && words.includes('serve')) {
    return { name: 'workerd', repoScoped: false }
  }
  return null
}

/** A readable name for the report. Falls back to the runtime when the tool is not one we know. */
function labelFor(text: string): string {
  if (/\/vite\/bin\/vite\.js\b/.test(text)) {
    return text.split(/\s+/).includes('preview') ? 'vite preview' : 'vite dev'
  }
  if (text.includes('http.server')) return 'http.server'
  const known = ['vite', 'esbuild', 'rollup', 'wrangler', 'serve'].find((one) =>
    text.includes(`/${one}/`),
  )
  return known ?? 'node or python'
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
    const named = nameFor(row)
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
  const where = target.ports.length > 0 ? `  port ${target.ports.join(', ')}` : ''
  return `  ${target.name.padEnd(16)}pid ${String(target.pid).padEnd(8)}${where}`
}

/**
 * Anything sitting on a port this repo serves on that the rules above did not claim. Reported and
 * never stopped: it is as likely to be another project, or an editor, as it is to be ours. The
 * point is that the script stops being able to say "nothing is running" while one of our ports is
 * held by something -- which is the exact way it was wrong before.
 */
function squatters(rows: readonly Row[], claimed: readonly Target[]): Row[] {
  const taken = new Set(claimed.map((one) => one.pid))
  const mine = ancestry(rows)
  return rows.filter(
    (row) =>
      !taken.has(row.pid) &&
      !mine.has(row.pid) &&
      row.ports.some((port) => OUR_PORTS.includes(port)),
  )
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

  const rows = look()
  let running = targets(rows)

  /** Printed whether or not anything was ours, since its whole job is to contradict a clean bill. */
  const alsoOnOurPorts = squatters(rows, running)
  const reportSquatters = () => {
    if (alsoOnOurPorts.length === 0) return
    console.log('\nNot ours, but sitting on a port this repo uses:')
    for (const row of alsoOnOurPorts) {
      const port = row.ports.filter((one) => OUR_PORTS.includes(one)).join(', ')
      console.log(`  ${row.image.padEnd(16)}pid ${String(row.pid).padEnd(8)}  port ${port}`)
    }
    console.log('  Left alone. Stop it yourself if it is in the way.')
  }

  if (running.length === 0) {
    console.log('No dev servers of this repo are running.')
    reportSquatters()
    return
  }

  const started = running.length
  for (const target of running) console.log(describe(target))
  if (running.some((target) => !target.repoScoped)) {
    console.log(
      '\n  wrangler and workerd carry no path, so those are matched by program, not by repo.',
    )
  }
  reportSquatters()

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
