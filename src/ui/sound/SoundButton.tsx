import { useEffect, useRef, useState } from 'react'
import { useSound } from './useSound.ts'

/** The speaker button and its two switches: Music and Effects. */
export function SoundButton() {
  const { settings, setSettings } = useSound()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const anyOn = settings.music || settings.effects

  useEffect(() => {
    if (!open) return
    const away = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="sound" ref={root}>
      <button
        type="button"
        className="button button--small"
        aria-expanded={open}
        aria-label={anyOn ? 'Sound on' : 'Sound off'}
        title="Sound"
        onClick={() => setOpen((o) => !o)}
      >
        {anyOn ? '🔊' : '🔇'}
      </button>
      {open && (
        <div className="sound__menu" role="group" aria-label="Sound">
          <label className="sound__switch">
            <input
              type="checkbox"
              checked={settings.music}
              onChange={(event) => setSettings({ ...settings, music: event.target.checked })}
            />
            Music
          </label>
          <label className="sound__switch">
            <input
              type="checkbox"
              checked={settings.effects}
              onChange={(event) => setSettings({ ...settings, effects: event.target.checked })}
            />
            Effects
          </label>
        </div>
      )}
    </div>
  )
}
