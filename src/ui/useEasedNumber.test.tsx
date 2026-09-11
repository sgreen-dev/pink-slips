// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { easeOutCubic, SLIDE_MS, useEasedNumber } from './useEasedNumber.ts'
import { draw, screen } from './testRender.tsx'

/**
 * The curve is a pure function and is checked as one. The hook itself is checked for the two
 * things that would actually be noticed if they broke: it arrives at the number it was given,
 * and it does not animate at all for someone who has asked for no motion.
 */

function Readout({ ft }: { ft: number }) {
  return <span data-testid="ft">{Math.round(useEasedNumber(ft))}</span>
}

function stubMotionPreference(reduced: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('easeOutCubic', () => {
  it('starts still and ends still, having covered the whole distance', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
  })

  it('front-loads the movement, which is what "ease out" means', () => {
    // past halfway by the time a quarter of the time has gone
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.5)
    // and barely moves over the last quarter
    expect(1 - easeOutCubic(0.75)).toBeLessThan(0.02)
  })

  it('never goes backwards', () => {
    let last = -1
    for (let i = 0; i <= 20; i++) {
      const value = easeOutCubic(i / 20)
      expect(value).toBeGreaterThanOrEqual(last)
      last = value
    }
  })
})

describe('useEasedNumber', () => {
  it('shows the number at once when motion is not wanted', () => {
    stubMotionPreference(true)
    const view = draw(<Readout ft={0} />)
    view.rerender(<Readout ft={1320} />)
    // no frame has run, and none needs to
    expect(screen.getByTestId('ft').textContent).toBe('1320')
  })

  it('arrives at the number it was given', async () => {
    stubMotionPreference(false)
    const view = draw(<Readout ft={0} />)
    view.rerender(<Readout ft={660} />)
    await vi.waitFor(() => expect(screen.getByTestId('ft').textContent).toBe('660'), {
      timeout: SLIDE_MS * 4,
    })
  })

  it('starts from where it is, so the first frame does not jump', () => {
    stubMotionPreference(false)
    draw(<Readout ft={330} />)
    // before any frame runs, the value on screen is still the one it had
    expect(screen.getByTestId('ft').textContent).toBe('330')
  })
})
