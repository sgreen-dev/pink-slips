/**
 * Draws the link-preview card, `public/social.jpg`, from `scripts/social.html` (backlog U42):
 *
 *   npm run social
 *
 * A messenger shows this card for every shared link, rooms included, so it should look like the
 * game: the wordmark in Monoton with the start screen's glow, the tagline in Barlow and the last
 * line in Space Mono, all from `src/fonts/`, and the colours read from `src/index.css`, so the
 * card cannot drift from the stylesheet. Run it again after changing the wordmark or the tagline.
 *
 * It is drawn in a headless Chromium browser, Edge or Chrome (set CHROME to use another), at
 * exactly 1438x755, the 1.91:1 shape every reader crops to, and it has to stay under 300 KB,
 * above which some messengers quietly drop the preview (backlog note 28). A capture that caught a
 * fallback font, or came out too heavy, is refused rather than written. It is a JPEG: as a PNG
 * the glow's soft halos came to 420 KB, and a JPEG at quality 90 keeps them smooth for far less.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const TEMPLATE = join(ROOT, 'scripts', 'social.html')
const OUT = join(ROOT, 'public', 'social.jpg')
const WIDTH = 1438
const HEIGHT = 755
const MAX_BYTES = 300_000
const QUALITY = 90
const MARKER = '/* fonts and colours */'

/** Each face the card sets, and its file in src/fonts/. */
const FONTS: ReadonlyArray<readonly [family: string, weight: number, file: string]> = [
  ['Monoton', 400, 'monoton-400-wordmark.woff2'],
  ['Barlow', 500, 'barlow-500-latin.woff2'],
  ['Space Mono', 400, 'space-mono-400-latin.woff2'],
]

/** The stylesheet's colours the card uses. */
const TOKENS = [
  'asphalt',
  'paper-ink',
  'muted',
  'pink',
  'pink-2',
  'gold',
  'wordmark-ink',
  'type-ev',
]

const BROWSERS = [
  process.env['CHROME'],
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

interface Message {
  id?: number
  method?: string
  result?: Record<string, unknown>
  error?: { message: string }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** The template with the fonts inlined and the colours set, ready to open from a file. */
function page(): string {
  const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
  const colours = TOKENS.map((name) => {
    const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]
    if (!value) throw new Error(`No --${name} in src/index.css`)
    return `--${name}: ${value.trim()};`
  })
  const faces = FONTS.map(([family, weight, file]) => {
    const data = readFileSync(join(ROOT, 'src', 'fonts', file)).toString('base64')
    return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`
  })
  const html = readFileSync(TEMPLATE, 'utf8')
  if (!html.includes(MARKER)) throw new Error(`No "${MARKER}" in ${TEMPLATE}`)
  return html.replace(MARKER, [...faces, `:root { ${colours.join(' ')} }`].join('\n'))
}

async function capture(file: string): Promise<Buffer> {
  const browser = BROWSERS.find(
    (path): path is string => typeof path === 'string' && existsSync(path),
  )
  if (!browser) throw new Error('No Chromium browser found; set CHROME to the path of one')
  const port = 9300 + Math.floor(Math.random() * 600)
  const profile = mkdtempSync(join(tmpdir(), 'pink-slips-social-'))
  const child = spawn(
    browser,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  try {
    let endpoint: string | undefined
    for (let i = 0; i < 80 && !endpoint; i++) {
      try {
        const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as {
          webSocketDebuggerUrl?: string
        }
        endpoint = version.webSocketDebuggerUrl
      } catch {
        await sleep(250)
      }
    }
    if (!endpoint) throw new Error('The browser did not open its debugging port')
    const ws = new WebSocket(endpoint)
    await new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = reject
    })
    let next = 0
    const replies = new Map<number, (message: Message) => void>()
    const events = new Map<string, () => void>()
    ws.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as Message
      if (message.id !== undefined) {
        replies.get(message.id)?.(message)
        replies.delete(message.id)
      } else if (message.method) {
        events.get(message.method)?.()
      }
    }
    const send = async (method: string, params: object = {}, sessionId?: string) => {
      const reply = await new Promise<Message>((resolve) => {
        const id = ++next
        replies.set(id, resolve)
        ws.send(JSON.stringify({ id, method, params, sessionId }))
      })
      if (reply.error) throw new Error(`${method}: ${reply.error.message}`)
      return reply.result ?? {}
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const session = String(sessionId)
    await send('Page.enable', {}, session)
    await send(
      'Emulation.setDeviceMetricsOverride',
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
      session,
    )
    const loaded = new Promise<void>((resolve) => events.set('Page.loadEventFired', resolve))
    await send('Page.navigate', { url: pathToFileURL(file).href }, session)
    await loaded
    const { result } = await send(
      'Runtime.evaluate',
      {
        expression:
          'document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))',
        awaitPromise: true,
        returnByValue: true,
      },
      session,
    )
    const families = ((result as { value?: string[] } | undefined)?.value ?? []).map((family) =>
      family.replace(/["']/g, ''),
    )
    for (const [family] of FONTS) {
      if (!families.includes(family)) throw new Error(`${family} did not load; nothing was written`)
    }
    const { data } = await send(
      'Page.captureScreenshot',
      {
        format: 'jpeg',
        quality: QUALITY,
        clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT, scale: 1 },
      },
      session,
    )
    await send('Browser.close').catch(() => undefined)
    ws.close()
    return Buffer.from(String(data), 'base64')
  } finally {
    child.kill()
    await sleep(500)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // The browser can hold its profile a moment after closing; a temp folder left behind is harmless.
    }
  }
}

async function main(): Promise<void> {
  const file = join(mkdtempSync(join(tmpdir(), 'pink-slips-card-')), 'social.html')
  writeFileSync(file, page())
  const image = await capture(file)
  if (image.length > MAX_BYTES) {
    throw new Error(
      `The card came out at ${image.length.toLocaleString()} bytes, over the ${MAX_BYTES.toLocaleString()} some messengers accept; nothing was written`,
    )
  }
  writeFileSync(OUT, image)
  console.log(`public/social.jpg: ${WIDTH}x${HEIGHT}, ${image.length.toLocaleString()} bytes`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
