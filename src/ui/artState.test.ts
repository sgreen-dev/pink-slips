import { describe, expect, it } from 'vitest'
import { initialArtState, nextArtState, showsImage, showsSilhouette } from './artState.ts'

describe('card art fallback', () => {
  it('shows the silhouette alone when a car has no illustration', () => {
    const state = initialArtState('')
    expect(state).toBe('none')
    expect(showsSilhouette(state)).toBe(true)
    expect(showsImage(state)).toBe(false)
    expect(nextArtState(state, 'load')).toBe('none')
  })

  it('keeps the silhouette under the image until it loads, then hides it', () => {
    let state = initialArtState('/art/honda-civic-si.webp')
    expect(state).toBe('loading')
    expect(showsSilhouette(state)).toBe(true)
    expect(showsImage(state)).toBe(true)
    state = nextArtState(state, 'load')
    expect(state).toBe('loaded')
    expect(showsSilhouette(state)).toBe(false)
    expect(showsImage(state)).toBe(true)
  })

  it('falls back to the silhouette when the image fails', () => {
    const state = nextArtState(initialArtState('/art/x.webp'), 'error')
    expect(state).toBe('failed')
    expect(showsSilhouette(state)).toBe(true)
    expect(showsImage(state)).toBe(false)
  })
})
