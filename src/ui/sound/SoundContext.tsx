import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MusicPlayer } from './music.ts'
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from './settings.ts'
import { playEffect, type SoundName } from './sfx.ts'
import { GESTURE_EVENTS, unlockOnGesture } from './unlock.ts'
import { SoundContext, type SoundHandle } from './useSound.ts'

const AUDIO_BASE = `${import.meta.env.BASE_URL}audio/`

/**
 * Owns the sound settings, the music player, and the one gesture that unlocks audio.
 * Browsers refuse to play until the page is clicked or tapped, so nothing sounds before then.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<SoundSettings>(loadSoundSettings)
  const [played, setPlayed] = useState(0)
  const [player] = useState(() => new MusicPlayer(AUDIO_BASE))

  useEffect(() => {
    player.setEnabled(settings.music)
  }, [player, settings.music])

  // Every gesture nudges the engine until it runs; phones can need more than one try.
  useEffect(() => {
    const unlock = () => {
      unlockOnGesture()
      // A source scheduled on a suspended engine plays the moment the engine runs.
      player.unlock()
    }
    for (const type of GESTURE_EVENTS) window.addEventListener(type, unlock)
    return () => {
      for (const type of GESTURE_EVENTS) window.removeEventListener(type, unlock)
    }
  }, [player])

  const setSettings = useCallback((next: SoundSettings) => {
    setSettingsState(next)
    saveSoundSettings(next)
  }, [])

  const effects = settings.effects
  const play = useCallback(
    (name: SoundName, intensity = 1) => {
      if (!effects) return
      playEffect(name, intensity)
      player.duck()
      setPlayed((n) => n + 1)
    },
    [effects, player],
  )

  const setTrack = useCallback((track: string | null) => player.setTrack(track), [player])

  const handle = useMemo<SoundHandle>(
    () => ({ settings, setSettings, play, setTrack, played }),
    [settings, setSettings, play, setTrack, played],
  )
  return <SoundContext value={handle}>{children}</SoundContext>
}
