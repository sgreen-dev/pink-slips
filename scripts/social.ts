/**
 * Draws the two pictures a phone or a messenger shows for the site, from the templates beside this
 * script (backlog U42 and U43):
 *
 *   npm run social
 *
 * - `public/social.jpg`, the link-preview card a messenger shows for every shared link, rooms
 *   included, from `scripts/social.html`: the wordmark in Monoton with the start screen's glow,
 *   the tagline in Barlow and the last line in Space Mono. It is 1438x755, the 1.91:1 shape every
 *   reader crops to, and has to stay under 300 KB, above which some messengers quietly drop the
 *   preview (backlog note 28). A JPEG: as a PNG the glow's soft halos came to 420 KB.
 * - `public/apple-touch-icon-ps.png`, the icon a phone shows for the site, on its home screen and in
 *   its Dynamic Island while the music plays, from `scripts/icon.html`: PS in the same neon. The
 *   whole wordmark was tried first and read as a smudge at the size the island shows it. It is
 *   180x180, the size iOS asks for, and square, since iOS rounds the corners itself.
 *
 * The fonts come from `src/fonts/` and the colours from `src/index.css`, so neither picture can
 * drift from the game; run it again after changing the wordmark, the tagline or the palette. Both
 * are drawn in a headless Chromium browser, Edge or Chrome (set CHROME to use another), and a
 * capture that caught a fallback font, or came out over its size, is refused rather than written.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const MARKER = '/* fonts and colours */'
const JPEG_QUALITY = 90

type Face = readonly [family: string, weight: number, file: string]
const MONOTON: Face = ['Monoton', 400, 'monoton-400-wordmark.woff2']
const BARLOW: Face = ['Barlow', 500, 'barlow-500-latin.woff2']
const SPACE_MONO: Face = ['Space Mono', 400, 'space-mono-400-latin.woff2']

interface Drawing {
  /** The template, in scripts/. */
  template: string
  /** Where the picture goes, in public/. */
  out: string
  width: number
  height: number
  format: 'jpeg' | 'png'
  maxBytes: number
  faces: readonly Face[]
}

const DRAWINGS: readonly Drawing[] = [
  {
    template: 'social.html',
    out: 'social.jpg',
    width: 1438,
    height: 755,
    format: 'jpeg',
    maxBytes: 300_000,
    faces: [MONOTON, BARLOW, SPACE_MONO],
  },
  {
    template: 'icon.html',
    out: 'apple-touch-icon-ps.png',
    width: 180,
    height: 180,
    format: 'png',
    maxBytes: 100_000,
    faces: [MONOTON],
  },
]

/** The stylesheet's colours the templates use. */
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

/** A template with its fonts inlined and the colours set, ready to open from a file. */
function page(drawing: Drawing): string {
  const css = readFileSync(join(ROOT, 'src', 'index.css'), 'utf8')
  const colours = TOKENS.map((name) => {
    const value = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]
    if (!value) throw new Error(`No --${name} in src/index.css`)
    return `--${name}: ${value.trim()};`
  })
  const faces = drawing.faces.map(([family, weight, file]) => {
    const data = readFileSync(join(ROOT, 'src', 'fonts', file)).toString('base64')
    return `@font-face { font-family: '${family}'; font-weight: ${weight}; src: url(data:font/woff2;base64,${data}) format('woff2'); }`
  })
  const template = join(ROOT, 'scripts', drawing.template)
  const html = readFileSync(template, 'utf8')
  if (!html.includes(MARKER)) throw new Error(`No "${MARKER}" in ${template}`)
  return html.replace(MARKER, [...faces, `:root { ${colours.join(' ')} }`].join('\n'))
}

async function capture(file: string, drawing: Drawing): Promise<Buffer> {
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
      { width: drawing.width, height: drawing.height, deviceScaleFactor: 1, mobile: false },
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
    for (const [family] of drawing.faces) {
      if (!families.includes(family)) throw new Error(`${family} did not load; nothing was written`)
    }
    const { data } = await send(
      'Page.captureScreenshot',
      {
        format: drawing.format,
        ...(drawing.format === 'jpeg' ? { quality: JPEG_QUALITY } : {}),
        clip: { x: 0, y: 0, width: drawing.width, height: drawing.height, scale: 1 },
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
  for (const drawing of DRAWINGS) {
    const file = join(mkdtempSync(join(tmpdir(), 'pink-slips-card-')), drawing.template)
    writeFileSync(file, page(drawing))
    const image = await capture(file, drawing)
    if (image.length > drawing.maxBytes) {
      throw new Error(
        `${drawing.out} came out at ${image.length.toLocaleString()} bytes, over its ${drawing.maxBytes.toLocaleString()}; nothing was written`,
      )
    }
    writeFileSync(join(ROOT, 'public', drawing.out), image)
    console.log(
      `public/${drawing.out}: ${drawing.width}x${drawing.height}, ${image.length.toLocaleString()} bytes`,
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
