/**
 * Whether a card shows its illustration or the silhouette. Kept as plain data so the fallback
 * rule has a test without a browser.
 */
export type ArtState = 'none' | 'loading' | 'loaded' | 'failed'

export type ArtEvent = 'start' | 'load' | 'error'

/** The state a card starts in for a given image path. */
export function initialArtState(imageUrl: string): ArtState {
  return imageUrl ? 'loading' : 'none'
}

export function nextArtState(state: ArtState, event: ArtEvent): ArtState {
  if (state === 'none') return 'none'
  switch (event) {
    case 'start':
      return 'loading'
    case 'load':
      return 'loaded'
    case 'error':
      return 'failed'
  }
}

/** The silhouette shows whenever the illustration is not fully loaded. */
export function showsSilhouette(state: ArtState): boolean {
  return state !== 'loaded'
}

export function showsImage(state: ArtState): boolean {
  return state === 'loading' || state === 'loaded'
}
