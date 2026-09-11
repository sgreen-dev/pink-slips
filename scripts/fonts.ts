/**
 * Fetches the game's fonts into `src/fonts/` and writes `src/fonts.css` to load them (backlog P6):
 *
 *   npm run fonts
 *
 * The site used to load them from Google, which cost every visit two more origins to reach, a
 * stylesheet from each that held back the first paint, and the player's address handed to a third
 * party. Served from the site itself, the first load asks nothing of anyone else.
 *
 * It asks Google for what it serves a current Chrome and keeps every face and every subset exactly
 * as served, so nothing renders differently: each subset still downloads only when a page uses a
 * character in its range. Each family's licence is written beside its files. Monoton and Wallpoet
 * are cut down to the glyphs of the wordmark and the ten digits, as they were on Google, so a new
 * wordmark means changing WORDMARK below and running this again, or the letters it is missing fall
 * back silently.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../src/fonts/', import.meta.url))
const CSS = fileURLToPath(new URL('../src/fonts.css', import.meta.url))
const WORDMARK = 'PINK SLIPS'
const DIGITS = '0123456789'

/** A current Chrome, so Google answers with WOFF2 split into its usual subsets. */
const AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

const SHEETS: readonly { url: string; subset: string | null }[] = [
  {
    url: 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Saira+Condensed:wght@600;700&family=Space+Mono:wght@400;700&display=swap',
    subset: null,
  },
  {
    url: `https://fonts.googleapis.com/css2?family=Monoton&text=${encodeURIComponent(WORDMARK)}&display=swap`,
    subset: 'wordmark',
  },
  {
    url: `https://fonts.googleapis.com/css2?family=Wallpoet&text=${DIGITS}&display=swap`,
    subset: 'digits',
  },
]

/** Each family's folder in the google/fonts repository, where its OFL.txt lives. */
const LICENCES: Readonly<Record<string, string>> = {
  Barlow: 'barlow',
  'Saira Condensed': 'sairacondensed',
  'Space Mono': 'spacemono',
  Monoton: 'monoton',
  Wallpoet: 'wallpoet',
}

const HEADER = `/*
 * The game's five typefaces, served from the site itself rather than from Google (backlog P6).
 * Written by \`npm run fonts\`, which keeps every face and subset exactly as Google serves them,
 * so each subset below still downloads only when a page uses a character in its range. Monoton
 * and Wallpoet are cut to the glyphs of "${WORDMARK}" and the ten digits, so a new wordmark needs
 * the script run again. Every family is under the SIL Open Font License 1.1, whose text sits
 * beside its files in src/fonts/.
 */
`

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': AGENT } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response
}

function field(block: string, name: string): string | undefined {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim()
}

async function main(): Promise<void> {
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  const rules: string[] = []
  let bytes = 0
  for (const sheet of SHEETS) {
    const css = await (await get(sheet.url)).text()
    for (const found of css.matchAll(/(?:\/\* ([a-z-]+) \*\/\s*)?@font-face \{([^}]*)\}/g)) {
      const block = found[2] ?? ''
      const family = /font-family: '([^']+)'/.exec(block)?.[1]
      const source = /src: url\(([^)]+)\)/.exec(block)?.[1]
      if (!family || !source) throw new Error(`A face with no family or no source in ${sheet.url}`)
      const weight = field(block, 'font-weight') ?? '400'
      const style = field(block, 'font-style') ?? 'normal'
      const range = field(block, 'unicode-range')
      const subset = found[1] ?? sheet.subset ?? 'all'
      const file = `${family.toLowerCase().replaceAll(' ', '-')}-${weight}-${subset}.woff2`
      const data = new Uint8Array(await (await get(source)).arrayBuffer())
      writeFileSync(`${OUT}${file}`, data)
      bytes += data.length
      rules.push(
        [
          '@font-face {',
          `  font-family: '${family}';`,
          `  font-style: ${style};`,
          `  font-weight: ${weight};`,
          '  font-display: swap;',
          `  src: url('./fonts/${file}') format('woff2');`,
          ...(range ? [`  unicode-range: ${range};`] : []),
          '}',
        ].join('\n'),
      )
      console.log(`${file}: ${data.length.toLocaleString()} bytes`)
    }
  }
  for (const [family, folder] of Object.entries(LICENCES)) {
    const licence = await (
      await get(`https://raw.githubusercontent.com/google/fonts/main/ofl/${folder}/OFL.txt`)
    ).text()
    writeFileSync(`${OUT}${folder}-OFL.txt`, licence.replace(/\r\n/g, '\n'))
    console.log(`${family}: licence written`)
  }
  writeFileSync(CSS, `${HEADER}\n${rules.join('\n\n')}\n`)
  console.log(`${rules.length} faces, ${bytes.toLocaleString()} bytes in all`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
