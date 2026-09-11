// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { CollectionScreen } from './CollectionScreen.tsx'
import { DetailContext } from './detailContext.ts'
import { SoundContext, type SoundHandle } from './sound/useSound.ts'
import { draw, fireEvent } from './testRender.tsx'

/**
 * Money makes a noise (DESIGN.md 8, Sound). The wiring is what this checks, not the sounds
 * themselves, which are judged by ear: that scrapping rings coins, that buying rings the
 * register, and above all that **a refused action stays silent** — a till that rings when
 * nothing was bought is worse than one that never rings at all.
 */

function seed(owned: Record<string, number>, extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned,
      packs: 0,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits: 0,
      ...extra,
    }),
  )
}

function open() {
  const play = vi.fn()
  const handle: SoundHandle = {
    settings: { music: false, effects: true },
    setSettings: vi.fn(),
    play,
    setScene: vi.fn(),
  }
  const view = draw(
    <SoundContext value={handle}>
      <DetailContext value={vi.fn()}>
        <CollectionScreen onBack={vi.fn()} />
      </DetailContext>
    </SoundContext>,
  )
  return { ...view, play }
}

/** The first button whose label starts with `text`, or undefined when there is none. */
function button(text: string) {
  return [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().toLowerCase().startsWith(text.toLowerCase()),
  )
}

describe('the sound of money on the collection screen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('rings coins once spare cards are actually scrapped', () => {
    // four copies of one car is three more than any deck can use, so there is something spare
    seed({ 'mazda-rx-7': 4 })
    const { play } = open()

    const start = button('scrap')
    expect(start, 'no scrap control on screen').toBeTruthy()
    fireEvent.click(start!)
    // it asks first; the sound belongs to the confirmation, not the question
    expect(play).not.toHaveBeenCalled()

    // the question is "Scrap N spare cards"; the answer is "Scrap for N credits"
    const confirm = [...document.querySelectorAll('button')].find((b) =>
      /^scrap for /i.test(b.textContent?.trim() ?? ''),
    )
    expect(confirm, 'no confirmation offered').toBeTruthy()
    fireEvent.click(confirm!)
    expect(play).toHaveBeenCalledWith('scrap')
  })

  it('stays silent when there is nothing spare to scrap', () => {
    seed({ 'mazda-rx-7': 1 })
    const { play } = open()
    const start = button('scrap')
    if (start) {
      fireEvent.click(start)
      const confirm = [...document.querySelectorAll('button')].find((b) =>
        /^scrap for /i.test(b.textContent?.trim() ?? ''),
      )
      if (confirm) fireEvent.click(confirm)
    }
    expect(play).not.toHaveBeenCalledWith('scrap')
  })

  it('rings the register when a card is actually bought', () => {
    // 500 credits buys anything; the cheapest tier is 40
    seed({ 'mazda-rx-7': 1 }, { credits: 500 })
    const { play } = open()

    const picker = document.querySelector('select')
    expect(picker, 'no card picker on screen').toBeTruthy()
    fireEvent.change(picker!, { target: { value: 'acura-integra-type-r' } })
    // the control reads "Pick a card" until one is picked, so this also proves the pick took
    const buy = button('buy')
    expect(buy, 'buy control never became available').toBeTruthy()
    fireEvent.click(buy!)

    expect(play).toHaveBeenCalledWith('buy')
  })

  it('never rings the register for a card that was not bought', () => {
    // no credits, so nothing can be afforded and no buy can succeed
    seed({ 'mazda-rx-7': 1 }, { credits: 0 })
    const { play } = open()
    const buy = button('buy')
    if (buy) fireEvent.click(buy)
    expect(play).not.toHaveBeenCalledWith('buy')
  })

  it('offers both sounds to the effects engine under names it knows', async () => {
    const { SOUND_NAMES } = await import('./sound/sfx.ts')
    expect(SOUND_NAMES).toContain('scrap')
    expect(SOUND_NAMES).toContain('buy')
  })
})
