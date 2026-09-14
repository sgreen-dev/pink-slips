// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { CollectionScreen } from './CollectionScreen.tsx'
import { DetailContext } from './detailContext.ts'
import { SoundContext, type SoundHandle } from './sound/useSound.ts'
import { draw } from './testRender.tsx'

/**
 * The buy picker is read on a phone as the system's own sheet, which shows nothing but the
 * option text and the section headings (backlog U45). So the list is sectioned by grade with
 * the price in the heading, cars before mods, and each row is the card's name alone.
 */

function seed(owned: Record<string, number>, credits: number) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned,
      packs: 0,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits,
    }),
  )
}

function open() {
  const handle: SoundHandle = {
    settings: { music: false, effects: false },
    setSettings: vi.fn(),
    play: vi.fn(),
    setScene: vi.fn(),
  }
  return draw(
    <SoundContext value={handle}>
      <DetailContext value={vi.fn()}>
        <CollectionScreen onBack={vi.fn()} />
      </DetailContext>
    </SoundContext>,
  )
}

describe('the buy picker', () => {
  beforeEach(() => {
    localStorage.clear()
    seed({ 'mazda-rx-7': 1 }, 40)
    open()
  })

  it('sections the list by grade, cars first, with the price in each heading', () => {
    const labels = [...document.querySelectorAll('select optgroup')].map((g) =>
      g.getAttribute('label'),
    )
    expect(labels.length).toBeGreaterThan(0)
    expect(labels[0]).toBe('Common cars · 40 credits')
    expect(labels).toContain('Ultra Rare cars · 500 credits')
    expect(labels).toContain('Common mods · 40 credits')
    expect(labels).toContain('Rare mods · 200 credits')
    // every car section comes before every mod section
    const firstMod = labels.findIndex((l) => l?.includes('mods'))
    expect(labels.slice(firstMod).every((l) => l?.includes('mods'))).toBe(true)
  })

  it('names each card once, without a price on the row', () => {
    const rows = [...document.querySelectorAll('select optgroup option')].map((o) =>
      o.textContent?.trim(),
    )
    expect(rows).toContain('Acura Integra Type R')
    expect(rows.some((r) => / — \d+$/.test(r ?? ''))).toBe(false)
  })

  it('sorts the cards in a section by name', () => {
    const first = document.querySelector('select optgroup')!
    const names = [...first.querySelectorAll('option')].map((o) => o.textContent?.trim() ?? '')
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
  })
})
