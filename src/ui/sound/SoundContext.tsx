import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MusicPlayer } from './music.ts'
import { loadSoundSettings, saveSoundSettings, type SoundSettings } from './settings.ts'
import { playEffect, unlockEffects, type SoundName } from './sfx.ts'
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

  useEffect(() => {
    const unlock = () => {
      unlockEffects()
      player.unlock()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
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
