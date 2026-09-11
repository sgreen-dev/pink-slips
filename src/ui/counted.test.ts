import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EVENTS } from '../server/analytics.ts'

/**
 * Every event the service accepts is one the game sends (backlog Q54). Seven of the fifteen were
 * accepted and never sent, every finished match among them, so the owner's report printed a zero
 * that read as players giving up rather than as a count nobody made. The service's list is no
 * evidence that anything sends; this is.
 */

const UI = fileURLToPath(new URL('./', import.meta.url))

/** Every event name written into a `count(...)` call in the game's own code. */
function sentNames(): Set<string> {
  const names = new Set<string>()
  for (const file of readdirSync(UI, { recursive: true, encoding: 'utf8' })) {
    if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue
    for (const line of readFileSync(join(UI, file), 'utf8').split('\n')) {
      const at = line.search(/\bcount\(/)
      if (at < 0) continue
      for (const found of line.slice(at).matchAll(/'([a-z-]+)'/g)) names.add(found[1] ?? '')
    }
  }
  return names
}

describe('the events the service accepts', () => {
  it('are each sent from somewhere in the game', () => {
    const sent = sentNames()
    expect(EVENTS.filter((name) => !sent.has(name))).toEqual([])
  })
})
