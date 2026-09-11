import { describe, expect, it } from 'vitest'
import { claim, entryOf, ownerUnknown } from './dev-stop-rules.ts'

/**
 * What `npm run dev:stop` may stop (backlog Q44). The rules on their own, against command lines
 * written out here, so no test ever lists or stops a real process.
 */

/** A path written with forward slashes, turned into the backslashes a Windows command line has. */
const win = (path: string) => path.replaceAll('/', String.fromCharCode(92))

const ROOT = 'c:/users/dev/pink-slips'
const REPO = win('C:/Users/dev/pink-slips')
const NODE = `"${win('C:/Program Files/nodejs/node.exe')}"`
const CACHE = win('C:/Users/dev/AppData/Local/npm-cache/_npx/1/node_modules')

describe('what dev-stop may stop', () => {
  it("claims a server started on a file inside this repo, as npm's shim writes it", () => {
    const shim = `${NODE} "${REPO}${win('/node_modules/.bin//../vite/bin/vite.js')}" --port 5173`
    expect(claim(shim, 'node', ROOT)).toBe('vite dev')
    const preview = `${NODE} ${REPO}${win('/node_modules/vite/bin/vite.js')} preview`
    expect(claim(preview, 'node', ROOT)).toBe('vite preview')
    const script = `python ${REPO}${win('/scripts/art/serve.py')}`
    expect(claim(script, 'python', ROOT)).toBe('node or python')
  })

  it('leaves a tool started elsewhere alone, whatever paths here it was handed', () => {
    // A language server with this folder as its workspace, a codemod pointed at a file here and a
    // file server pointed at a folder here all carry the repo path, and all used to be stopped.
    const server = `${NODE} ${win('C:/Users/dev/.vscode/extensions/ts/server.js')} --workspace ${REPO}`
    expect(claim(server, 'node', ROOT)).toBeNull()
    const codemod = `${NODE} ${win('C:/tools/codemod.js')} ${REPO}${win('/src/index.ts')}`
    expect(claim(codemod, 'node', ROOT)).toBeNull()
    const files = `python -m http.server 4300 --directory ${REPO}${win('/public')}`
    expect(claim(files, 'python', ROOT)).toBeNull()
  })

  it('leaves a sibling checkout, a watcher and itself alone', () => {
    const sibling = `${NODE} ${win('C:/Users/dev/pink-slips-old/node_modules/vite/bin/vite.js')}`
    expect(claim(sibling, 'node', ROOT)).toBeNull()
    const watcher = `${NODE} ${REPO}${win('/node_modules/vitest/vitest.mjs')}`
    expect(claim(watcher, 'node', ROOT)).toBeNull()
    const itself = `${NODE} ${REPO}${win('/scripts/dev-stop.ts')} --check`
    expect(claim(itself, 'node', ROOT)).toBeNull()
  })

  it('claims nothing outside the runtimes this repo starts things in', () => {
    const editor = `"${win('C:/Program Files/Editor/editor.exe')}" ${REPO}${win('/src/main.tsx')}`
    expect(claim(editor, 'editor', ROOT)).toBeNull()
  })

  it('names wrangler dev and workerd without claiming either, since nothing says whose', () => {
    const wrangler = `${NODE} ${CACHE}${win('/wrangler/wrangler-dist/cli.js')} dev`
    expect(claim(wrangler, 'node', ROOT)).toBeNull()
    expect(ownerUnknown(wrangler)).toBe('wrangler dev')
    const workerd = `${CACHE}${win('/@cloudflare/workerd-windows-64/bin/workerd.exe')} serve -`
    expect(ownerUnknown(workerd)).toBe('workerd')
    const deploy = `${NODE} ${CACHE}${win('/wrangler/wrangler-dist/cli.js')} deploy`
    expect(ownerUnknown(deploy)).toBeNull()
  })

  it('finds the file a runtime was started on, and none for code run by name', () => {
    expect(entryOf(`${NODE} --max-old-space-size=4096 ${REPO}${win('/a.js')}`)).toBe(`${ROOT}/a.js`)
    expect(entryOf('python -m http.server')).toBeNull()
    expect(entryOf(`${NODE} -e "console.log(1)"`)).toBeNull()
  })
})
