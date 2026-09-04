import { useEffect, useState } from 'react'
import { MAX_NAME_LENGTH, normalizeRecoveryCode } from '../protocol/messages.ts'
import { nameProblem } from '../protocol/names.ts'
import { createPlayer, recoverPlayer } from './account.ts'

export type PlayerView = 'create' | 'recover' | 'code'

interface PlayerDialogProps {
  endpoint: string
  view: PlayerView
  /** The recovery code to show, for the code view. */
  code?: string | null
  /** A player was made or recovered: the token is the browser's session from now on. */
  onSignedIn: (token: string, recoveryCode: string | null) => void
  onClose: () => void
}

/**
 * The way into an account: make a player from a name, take one back with a recovery code,
 * or read the code that was just issued. One pop-up in the same style as the pack reveal.
 */
export function PlayerDialog({ endpoint, view, code, onSignedIn, onClose }: PlayerDialogProps) {
  const [current, setCurrent] = useState<PlayerView>(view)
  const [shown, setShown] = useState<string | null>(code ?? null)
  const [name, setName] = useState('')
  const [entered, setEntered] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && current !== 'code') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, onClose])

  const problem = name.trim() === '' ? null : nameProblem(name)
  const create = async () => {
    if (problem) {
      setError(problem)
      return
    }
    setBusy(true)
    setError(null)
    const made = await createPlayer(endpoint, name)
    setBusy(false)
    if (made === 'refused') {
      setError('That name is not allowed here. Try another.')
      return
    }
    if (!made) {
      setError('The service did not answer. Try again in a moment.')
      return
    }
    setShown(made.recoveryCode)
    setCurrent('code')
    onSignedIn(made.token, made.recoveryCode)
  }

  const recover = async () => {
    const clean = normalizeRecoveryCode(entered)
    if (!clean) {
      setError('A recovery code is twelve letters and numbers, like ABCD-EFGH-JKLM.')
      return
    }
    setBusy(true)
    setError(null)
    const found = await recoverPlayer(endpoint, clean)
    setBusy(false)
    if (found === 'unknown') {
      setError('No player has that code. Check it and try again.')
      return
    }
    if (!found) {
      setError('The service did not answer. Try again in a moment.')
      return
    }
    onSignedIn(found.token, null)
    onClose()
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown ?? '')
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="raceend" role="dialog" aria-modal="true" aria-labelledby="player-title">
      <div className="raceend__panel player">
        {current === 'create' && (
          <form
            className="player__form"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <h2 id="player-title" className="player__title">
              Create a player
            </h2>
            <p className="player__lead">
              A player keeps your collection, your garages, and your rating on the service, so they
              follow you to any device and you can play ranked matches.
            </p>
            <label className="online__field">
              Your name
              <input
                type="text"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            {problem && <p className="online__error">{problem}</p>}
            <div className="online__actions">
              <button
                type="submit"
                className="button button--primary button--big"
                disabled={busy || problem !== null}
              >
                {busy ? 'Creating…' : 'Create my player'}
              </button>
              <button type="button" className="button" onClick={onClose}>
                Not now
              </button>
            </div>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => {
                setError(null)
                setCurrent('recover')
              }}
            >
              I have a recovery code
            </button>
          </form>
        )}
        {current === 'recover' && (
          <form
            className="player__form"
            onSubmit={(event) => {
              event.preventDefault()
              void recover()
            }}
          >
            <h2 id="player-title" className="player__title">
              Recover a player
            </h2>
            <p className="player__lead">
              Enter the recovery code from the device where you made the player.
            </p>
            <label className="online__field online__field--code">
              Recovery code
              <input
                type="text"
                value={entered}
                placeholder="ABCD-EFGH-JKLM"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                onChange={(event) => setEntered(event.target.value)}
              />
            </label>
            <div className="online__actions">
              <button type="submit" className="button button--primary button--big" disabled={busy}>
                {busy ? 'Looking…' : 'Recover'}
              </button>
              <button type="button" className="button" onClick={onClose}>
                Not now
              </button>
            </div>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => {
                setError(null)
                setCurrent('create')
              }}
            >
              Make a new player instead
            </button>
          </form>
        )}
        {current === 'code' && (
          <div className="player__form">
            <h2 id="player-title" className="player__title">
              Your recovery code
            </h2>
            <p className="online__code player__code" aria-label={`Recovery code ${shown ?? ''}`}>
              {shown}
            </p>
            <p className="player__lead">
              Write this down or save it somewhere safe. It is the only way to get this player back
              on another device, or on this one if the browser is ever cleared. You can get a new
              code from your profile at any time.
            </p>
            <div className="online__actions">
              <button type="button" className="button" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button
                type="button"
                className="button button--primary button--big"
                onClick={onClose}
              >
                I saved it
              </button>
            </div>
          </div>
        )}
        {error && (
          <p className="online__error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
