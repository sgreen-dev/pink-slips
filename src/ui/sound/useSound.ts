import { createContext, useContext } from 'react'
import type { Scene } from './music.ts'
import type { SoundName } from './sfx.ts'
import type { SoundSettings } from './settings.ts'

export interface SoundHandle {
  settings: SoundSettings
  setSettings: (next: SoundSettings) => void
  /** Plays an effect when effects are on and audio is unlocked. */
  play: (name: SoundName, intensity?: number) => void
  /** Tells the music which scene is on screen; a change starts the next track. */
  setScene: (scene: Scene) => void
  /** Effects played so far, for checks that cannot listen. */
  played: number
}

export const SoundContext = createContext<SoundHandle | null>(null)

const INERT: SoundHandle = {
  settings: { music: false, effects: false },
  setSettings: () => undefined,
  play: () => undefined,
  setScene: () => undefined,
  played: 0,
}

/** The sound handle, or an inert one outside the provider, so tests and screens never guard. */
export function useSound(): SoundHandle {
  return useContext(SoundContext) ?? INERT
}
