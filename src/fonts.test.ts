import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The fonts come from the site itself (backlog P6). Loading them from Google cost every visit two
 * more origins to reach, a stylesheet from each that held back the first paint, and the player's
 * address handed to a third party. These hold the line: nothing the page loads asks Google for a
 * font, and every family the stylesheet sets first is one this site serves.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const PAGE = read('../index.html')
const FACES = read('./fonts.css')
const STYLES = read('./index.css')

describe('the fonts', () => {
  it('are not fetched from Google', () => {
    expect(PAGE).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
    expect(FACES).not.toMatch(/fonts\.(googleapis|gstatic)\.com/)
  })

  it('are served for every family the stylesheet sets first', () => {
    const served = new Set([...FACES.matchAll(/font-family: '([^']+)'/g)].map((found) => found[1]))
    const wanted = [...STYLES.matchAll(/--font-[a-z]+: '([^']+)'/g)].map((found) => found[1])
    expect(wanted.length).toBeGreaterThan(0)
    for (const family of wanted) expect(served, family).toContain(family)
  })
})
