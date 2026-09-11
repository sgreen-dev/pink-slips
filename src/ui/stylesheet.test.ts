import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The stylesheet's cascade, checked from its source (backlog U30, U31). A media query adds no
 * specificity, so a rule inside one wins only when it is written after the rule it overrides, and
 * rules written above their base went unnoticed three times: the reduced-motion block, the phone
 * title spacing, and the `.screen__nav` fix before them. Both checks match selectors by their
 * exact text, which is how every one of those was written. A more specific selector winning from
 * somewhere else is still something only the computed style in a browser shows.
 */

const SOURCE = readFileSync(new URL('../index.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
)
const REDUCE = 'prefers-reduced-motion: reduce'

interface Rule {
  selectors: string[]
  declarations: Map<string, string>
  /** The condition of the `@media` block the rule sits in, or null at the top level. */
  media: string | null
  /** Where the rule starts, so two rules can be put in source order. */
  at: number
}

/** A selector list split at its top-level commas, leaving any inside `:is()` or `:not()`. */
function selectorsOf(head: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of head) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out.map((selector) => selector.trim().replace(/\s+/g, ' '))
}

function declarationsOf(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const part of body.split(';')) {
    const colon = part.indexOf(':')
    if (colon > 0) out.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
  }
  return out
}

/**
 * Every style rule in source order. `@keyframes` steps, `@font-face` and anything else under an
 * at-rule other than `@media` are not style rules and are skipped; a rule inside `@media` keeps
 * its condition.
 */
function parse(css: string): Rule[] {
  const rules: Rule[] = []
  const open: { kind: 'media' | 'rule' | 'other'; head: string; body: number }[] = []
  let from = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      const end = css.indexOf(ch, i + 1)
      if (end === -1) break
      i = end
    } else if (ch === '{') {
      const head = css.slice(from, i).trim()
      const inside = open.at(-1)?.kind
      const kind =
        inside === 'rule' || inside === 'other'
          ? 'other'
          : head.startsWith('@media')
            ? 'media'
            : head.startsWith('@')
              ? 'other'
              : 'rule'
      open.push({ kind, head, body: i + 1 })
      from = i + 1
    } else if (ch === '}') {
      const block = open.pop()
      if (block?.kind === 'rule') {
        const media = open
          .filter((b) => b.kind === 'media')
          .map((b) => b.head.replace(/^@media\s*/, ''))
        rules.push({
          selectors: selectorsOf(block.head),
          declarations: declarationsOf(css.slice(block.body, i)),
          media: media.length > 0 ? media.join(' and ') : null,
          at: block.body,
        })
      }
      from = i + 1
    } else if (ch === ';' && open.at(-1)?.kind !== 'rule') {
      from = i + 1
    }
  }
  return rules
}

const RULES = parse(SOURCE)
const reduced = RULES.filter((rule) => rule.media?.includes(REDUCE))

/** What a rule sets moving: an animation or a transition, with any value but none. */
function motionOf(rule: Rule): ('animation' | 'transition')[] {
  const out = new Set<'animation' | 'transition'>()
  for (const [property, value] of rule.declarations) {
    if (value === 'none') continue
    if (property === 'animation' || property === 'animation-name') out.add('animation')
    if (property === 'transition' || property === 'transition-property') out.add('transition')
  }
  return [...out]
}

describe('the stylesheet under Reduce Motion', () => {
  it('finds rules to check', () => {
    expect(RULES.length).toBeGreaterThan(300)
    expect(reduced.length).toBeGreaterThan(0)
  })

  it('keeps one reduced-motion block, with nothing written after it', () => {
    expect(SOURCE.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(1)
    const start = Math.min(...reduced.map((rule) => rule.at))
    const after = RULES.filter((rule) => rule.at > start && !rule.media?.includes(REDUCE))
    expect(after.map((rule) => rule.selectors.join(', '))).toEqual([])
  })

  it('switches off every animation and transition the file declares', () => {
    const missing: string[] = []
    for (const rule of RULES) {
      if (rule.media?.includes(REDUCE)) continue
      for (const family of motionOf(rule)) {
        for (const selector of rule.selectors) {
          const off = reduced.some(
            (r) => r.selectors.includes(selector) && r.declarations.get(family) === 'none',
          )
          if (!off) missing.push(`${selector} (${family})`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})

describe('the stylesheet under a media query', () => {
  it('writes every override after the rule it overrides', () => {
    // A rule in a media query that shares a selector and a property with a plain rule written
    // after it loses to that rule at every width, so its condition never decides anything.
    const dead: string[] = []
    for (const rule of RULES) {
      if (rule.media === null) continue
      for (const later of RULES) {
        if (later.media !== null || later.at < rule.at) continue
        for (const selector of rule.selectors) {
          if (!later.selectors.includes(selector)) continue
          for (const property of rule.declarations.keys()) {
            if (later.declarations.has(property)) {
              dead.push(`${selector} { ${property} } under ${rule.media}`)
            }
          }
        }
      }
    }
    expect(dead).toEqual([])
  })
})
