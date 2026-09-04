import { useState } from 'react'
import type { PlayerConfig } from '../engine/index.ts'
import { MAX_NAME_LENGTH } from '../protocol/messages.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { GaragePicker } from './GaragePicker.tsx'
import {
  clearOnlineSeat,
  createRoom,
  loadOnlineSeat,
  normalizeCode,
  type OnlineSeat,
} from './online.ts'
import { loadGarages } from './storage.ts'

/** How a player enters a room: a fresh join with a garage, or a resume with a saved token. */
export interface OnlineEntry {
  code: string
  name: string
  garage: PlayerConfig | null
  token: string | null
}

interface OnlineScreenProps {
  endpoint: string
  /** A code from a shared link, typed into the join field. */
  prefillCode: string | null
  onPlay: (entry: OnlineEntry) => void
  onBack: () => void
}

export function OnlineScreen({ endpoint, prefillCode, onPlay, onBack }: OnlineScreenProps) {
  const [options] = useState<GarageOption[]>(() => garageOptions(loadGarages()))
  const [saved, setSaved] = useState<OnlineSeat | null>(() => loadOnlineSeat())
  const [name, setName] = useState(saved?.name ?? 'Player')
  const [garage, setGarage] = useState(0)
  const [code, setCode] = useState(prefillCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cleanName = name.trim().slice(0, MAX_NAME_LENGTH) || 'Player'
  const config = (): PlayerConfig | null => {
    const option = options[garage]
    return option ? { garage: option.cars, deck: option.deck } : null
  }
  const create = async () => {
    setBusy(true)
    setError(null)
    const fresh = await createRoom(endpoint)
    setBusy(false)
    if (!fresh) {
      setError('The room service did not answer. Try again in a moment.')
      return
    }
    onPlay({ code: fresh, name: cleanName, garage: config(), token: null })
  }
  const join = () => {
    const clean = normalizeCode(code)
    if (!clean) {
      setError('A room code is six letters and numbers, like ABC234.')
      return
    }
    onPlay({ code: clean, name: cleanName, garage: config(), token: null })
  }
  const forget = () => {
    clearOnlineSeat()
    setSaved(null)
  }

  return (
    <main className="start online">
      <header className="builder__header">
        <h1 className="builder__title">Play online</h1>
        <button type="button" className="button" onClick={onBack}>
          Back
        </button>
      </header>
      <p className="start__tagline">
        Make a room and send the link to a friend, or type the code they sent you. The room runs the
        match, and each of you sees only your own hand.
      </p>
      {saved && (
        <section className="online__rejoin">
          <p>
            You have a seat in room <strong>{saved.code}</strong> as {saved.name}.
          </p>
          <button
            type="button"
            className="button button--primary"
            onClick={() =>
              onPlay({ code: saved.code, name: saved.name, garage: null, token: saved.token })
            }
          >
            Rejoin
          </button>
          <button type="button" className="button button--ghost" onClick={forget}>
            Forget it
          </button>
        </section>
      )}
      <label className="online__field">
        Your name
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="start__pickers start__pickers--one">
        <GaragePicker label="Your garage" options={options} value={garage} onChange={setGarage} />
      </div>
      <div className="online__actions">
        <button
          type="button"
          className="button button--primary button--big"
          disabled={busy}
          onClick={() => void create()}
        >
          {busy ? 'Making a room…' : 'Make a room'}
        </button>
        <form
          className="online__join"
          onSubmit={(event) => {
            event.preventDefault()
            join()
          }}
        >
          <label className="online__field online__field--code">
            Room code
            <input
              type="text"
              value={code}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>
          <button type="submit" className="button button--big">
            Join
          </button>
        </form>
      </div>
      {error && (
        <p className="online__error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
