/**
 * Deploys a worker with the commit it was built from baked in (backlog Q36):
 *
 *   node scripts/deploy-worker.ts rooms
 *   node scripts/deploy-worker.ts counter
 *   node scripts/deploy-worker.ts rooms --dirty     (deploy anyway, uncommitted work included)
 *
 * The site writes its commit into `version.json` at build time and each worker answers `/version`
 * with the one passed here, so `scripts/deploy-check.ts` can say whether all three are the same
 * commit rather than only that each of them answered.
 *
 * It refuses a dirty tree by default. Deploying uncommitted work leaves a running service that
 * claims a commit whose code is not what is running, which is worse than not stamping at all.
 */

import { execFileSync, execSync } from 'node:child_process'

const WORKERS: Record<string, string> = { rooms: 'server', counter: 'counter' }

const name = process.argv[2] ?? ''
const directory = WORKERS[name]
if (!directory) {
  console.error(
    `Usage: node scripts/deploy-worker.ts <${Object.keys(WORKERS).join('|')}> [--dirty]`,
  )
  process.exit(2)
}

const allowDirty = process.argv.includes('--dirty')
const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim()
if (status && !allowDirty) {
  console.error('Refusing to deploy: the working tree has uncommitted changes.\n')
  console.error(status)
  console.error('\nCommit them, or pass --dirty to deploy anyway.')
  process.exit(1)
}

const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
const stamp = status ? `${commit}-dirty` : commit
console.log(`Deploying ${name} from ${directory}/ as ${stamp}`)

execFileSync('npx', ['wrangler', 'deploy', '--var', `COMMIT:${stamp}`], {
  cwd: directory,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
