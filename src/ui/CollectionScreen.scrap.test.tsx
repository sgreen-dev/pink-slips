// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { CollectionScreen } from './CollectionScreen.tsx'
import { DetailContext } from './detailContext.ts'
import { SoundContext, type SoundHandle } from './sound/useSound.ts'
import { draw, fireEvent } from './testRender.tsx'

/**
 * The scrap control glows gold while there is something to scrap (backlog U40), since spare copies
 * pile up quietly and the credits they are worth are easy to miss. It glows only while it is a
 * question: once the player answers it, the glow goes with it.
 */

function seed(owned: Record<string, number>) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned,
      packs: 0,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits: 0,
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

const glowing = (root: HTMLElement) => [...root.querySelectorAll('.button--attention')]

describe('the scrap control', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('glows while spare cards wait', () => {
    seed({ 'mazda-rx-7': 4 })
    const lit = glowing(open().container)
    expect(lit).toHaveLength(1)
    expect(lit[0]?.textContent).toMatch(/^Scrap \d+ spare card/)
  })

  it('stops glowing once the player answers it', () => {
    seed({ 'mazda-rx-7': 4 })
    const { container } = open()
    const lit = glowing(container)[0]
    if (!(lit instanceof HTMLElement)) throw new Error('No glowing scrap control')
    fireEvent.click(lit)
    expect(glowing(container)).toHaveLength(0)
  })

  it('does not glow with nothing to scrap', () => {
    seed({ 'mazda-rx-7': 1 })
    expect(glowing(open().container)).toHaveLength(0)
  })
})
