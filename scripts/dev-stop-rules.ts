/**
 * Which processes `npm run dev:stop` may stop, kept apart from `scripts/dev-stop.ts` so the rules
 * can be tested against command lines written out by hand, and no test ever lists or stops a real
 * process (backlog Q44).
 */

/** Backslashes to slashes and lower case, so one spelling of a path is compared against another. */
export function plain(text: string): string {
  return text.replace(/\\/g, '/').toLowerCase()
}

/**
 * The runtimes this repo starts things in. Naming runtimes rather than tools -- vite, wrangler,
 * http.server -- is what keeps the match open: whatever is started in one of them is seen, tool
 * unknown, where a list of tools missed a static file server for most of a day.
 */
export const RUNTIMES: readonly string[] = ['node', 'python', 'pythonw', 'deno', 'bun']

/** A command line split into its arguments, with quotes honoured the way Windows writes them. */
export function argumentsOf(command: string): string[] {
  return [...command.matchAll(/"([^"]*)"|(\S+)/g)].map((found) => found[1] ?? found[2] ?? '')
}

/**
 * The file a runtime was started on, in plain form: its first argument that is not an option,
 * when that looks like a file. `python -m http.server` has none, and neither has code handed over
 * on the command line; both are answered with null.
 */
export function entryOf(command: string): string | null {
  const first = argumentsOf(command)
    .slice(1)
    .find((word) => !word.startsWith('-'))
  if (first === undefined) return null
  const shaped = plain(first)
  return shaped.includes('/') || /\.[cm]?[jt]s$|\.py$/.test(shaped) ? shaped : null
}

/**
 * What a process is when it is one of this repo's and may be stopped, or null. It is ours when it
 * runs in one of our RUNTIMES on a file inside the repo. Until backlog Q44 it was ours when the
 * repo path appeared anywhere on its command line, which also claimed a tool started elsewhere
 * that had been handed a path here -- a language server with this folder as its workspace, a
 * codemod pointed at a file -- and stopping one of those is the expensive kind of mistake. `root`
 * is the repo in plain form; the slash after it keeps a sibling checkout in `pink-slips-old` from
 * reading as this one.
 */
export function claim(command: string, image: string, root: string): string | null {
  if (!RUNTIMES.includes(image)) return null
  const entry = entryOf(command)
  if (entry === null || !entry.startsWith(`${root}/`)) return null
  // `npm run test:watch` runs vitest from inside the repo, and a watcher is not a stray.
  if (entry.includes('/vitest/')) return null
  // This script, so a second copy started by hand cannot stop the first mid-run.
  if (entry.endsWith('/scripts/dev-stop.ts')) return null
  return labelFor(plain(command))
}

/**
 * `wrangler dev` and the `workerd` it runs carry no path at all: wrangler resolves from the npx
 * cache and workerd is handed its config on stdin. Nothing says whose they are, so they are named
 * for the report and never stopped. Matched on program alone, as they were until backlog Q44,
 * another project's `wrangler dev` died with this one's.
 */
export function ownerUnknown(command: string): string | null {
  const text = plain(command)
  const words = text.split(/\s+/)
  // `dev` as a whole word, so `wrangler deploy` mid-flight is never mistaken for a dev server.
  if (text.includes('/wrangler/') && words.includes('dev')) return 'wrangler dev'
  if (/\/workerd(\.exe)?\b/.test(text) && words.includes('serve')) return 'workerd'
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
