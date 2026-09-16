import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Label contrast, read from the stylesheet's own source (backlog A12). The main button in every
 * panel was white on the accent pink, 2.9:1, and the family line printed on the cream mod card
 * was the border colour, down to 2.8:1; a label needs 4.5:1. These pairs are fixed colours, not a
 * picture behind the text, so they can be held here rather than only in a browser.
 */

const SOURCE = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)

/** The custom properties declared on `:root`. */
const TOKENS = new Map(
  [...(SOURCE.match(/:root\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [m[1] ?? '', (m[2] ?? '').trim()],
  ),
)

/** A declaration from the first rule whose selector is exactly `selector`. */
function declared(selector: string, property: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const body = SOURCE.match(new RegExp(`(?:^|[}\\s])${escaped}\\s*\\{([^}]*)\\}`))?.[1]
  const value = body?.match(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+);`))?.[1]
  if (!value) throw new Error(`No ${property} on ${selector}`)
  return value.trim()
}

/** A colour as a hex string, following `var()` through the tokens. */
function resolve(value: string): string {
  const named = value.match(/^var\((--[\w-]+)\)$/)?.[1]
  if (named) {
    const token = TOKENS.get(named)
    if (!token) throw new Error(`No token ${named}`)
    return resolve(token)
  }
  if (value === '#fff') return '#ffffff'
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Not a plain colour: ${value}`)
  return value
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(resolve(a)), luminance(resolve(b))].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

const LABEL = 4.5

describe('label contrast', () => {
  it('holds on the main button, at rest and under the pointer', () => {
    const label = declared('.button--primary', 'color')
    expect(contrast(label, declared('.button--primary', 'background'))).toBeGreaterThanOrEqual(
      LABEL,
    )
    expect(
      contrast(label, declared('.button--primary:hover:not(:disabled)', 'background')),
    ).toBeGreaterThanOrEqual(LABEL)
  })

  it('holds on the pink badge a card wears', () => {
    expect(
      contrast(declared('.card__badge', 'color'), declared('.card__badge', 'background')),
    ).toBeGreaterThanOrEqual(LABEL)
  })

  it('holds for each family line on the cream mod card', () => {
    const card = declared('.mod', 'background')
    for (const family of ['part', 'boost', 'sabotage']) {
      expect(contrast(declared(`.mod--${family}`, '--family-ink'), card)).toBeGreaterThanOrEqual(
        LABEL,
      )
    }
    expect(declared('.mod__family', 'color')).toContain('--family-ink')
  })

  it('holds for the white text on a Part chip and on the shield chip', () => {
    const text = declared('.chip', 'color')
    expect(contrast(text, declared('.chip', 'background'))).toBeGreaterThanOrEqual(LABEL)
    expect(contrast(text, declared('.chip--shield', 'background'))).toBeGreaterThanOrEqual(LABEL)
  })
})
