import { describe, expect, it } from 'vitest'
import { audioContext, effectsSnapshot, playEffect, SOUND_NAMES } from './sfx.ts'

/**
 * Vitest runs in node with no Web Audio, which is most of what this file does. What can be
 * checked without a browser is that it degrades instead of throwing: every entry point is
 * reached by the screens on every match, so one of them throwing here would take the board
 * down. The sounds themselves are judged by ear.
 */
describe('effects without a browser', () => {
  it('has no audio context to give, and says so rather than throwing', () => {
    expect(audioContext()).toBeNull()
  })

  it('plays nothing and throws nothing, for every effect the game names', () => {
    for (const name of SOUND_NAMES) {
      expect(() => playEffect(name), name).not.toThrow()
    }
    // The launch takes an intensity; the range is clamped rather than trusted.
    for (const intensity of [-1, 0, 0.5, 1, 2, Number.NaN]) {
      expect(() => playEffect('advance', intensity), String(intensity)).not.toThrow()
    }
  })

  it('reports nothing decoded, since nothing can be', () => {
    const snapshot = effectsSnapshot()
    expect(snapshot.decoded).toBe(0)
    expect(snapshot.files).toBeGreaterThanOrEqual(0)
  })

  it('names every effect once', () => {
    expect(new Set(SOUND_NAMES).size).toBe(SOUND_NAMES.length)
    expect(SOUND_NAMES.length).toBeGreaterThan(0)
  })
})
