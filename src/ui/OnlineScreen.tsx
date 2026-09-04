import { useContext, useEffect, useRef, useState } from 'react'
import type { PlayerConfig } from '../engine/index.ts'
import { MAX_NAME_LENGTH } from '../protocol/messages.ts'
import { AccountContext, QueueClient, queueUrl, type QueueStatus } from './account.ts'
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

/**
 * How a player enters a room: a fresh join with a garage, a resume with a saved token, or a
 * ranked match with the ticket the queue handed out.
 */
export interface OnlineEntry {
  code: string
  name: string
  garage: PlayerConfig | null
  token: string | null
  ticket: string | null
}

interface OnlineScreenProps {
  endpoint: string
  /** A code from a shared link, typed into the join field. */
  prefillCode: string | null
  onPlay: (entry: OnlineEntry) => void
  onBack: () => void
}

export function OnlineScreen({ endpoint, prefillCode, onPlay, onBack }: OnlineScreenProps) {
  const account = useContext(AccountContext)
  const [options] = useState<GarageOption[]>(() => garageOptions(loadGarages()))
  const [saved, setSaved] = useState<OnlineSeat | null>(() => loadOnlineSeat())
  const [name, setName] = useState(account?.data.profile.name ?? saved?.name ?? 'Player')
  const [garage, setGarage] = useState(0)
  const [code, setCode] = useState(prefillCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [waited, setWaited] = useState(0)
  const queueClient = useRef<QueueClient | null>(null)

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
    onPlay({ code: fresh, name: cleanName, garage: config(), token: null, ticket: null })
  }
  const join = () => {
    const clean = normalizeCode(code)
    if (!clean) {
      setError('A room code is six letters and numbers, like ABC234.')
      return
    }
    onPlay({ code: clean, name: cleanName, garage: config(), token: null, ticket: null })
  }
  const forget = () => {
    clearOnlineSeat()
    setSaved(null)
  }

  // The queue: one socket that waits until the service pairs this account with someone.
  const leaveQueue = () => {
    queueClient.current?.close()
    queueClient.current = null
    setQueue(null)
  }
  const findOpponent = () => {
    if (!account || queueClient.current) return
    setError(null)
    setWaited(0)
    const client = new QueueClient(queueUrl(endpoint, account.token), {
      onStatus: (status) => {
        setQueue(status)
        if (status === 'closed') {
          queueClient.current = null
          setError('Lost the queue. Try again.')
        }
      },
      onError: (reason) => setError(reason),
      onMatched: (matched) => {
        queueClient.current = null
        onPlay({
          code: matched.code,
          name: account.data.profile.name,
          garage: config(),
          token: null,
          ticket: matched.ticket,
        })
      },
    })
    queueClient.current = client
    client.connect()
  }
  useEffect(() => {
    if (queue !== 'waiting' && queue !== 'connecting') return
    const timer = setInterval(() => setWaited((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [queue])
  useEffect(() => () => queueClient.current?.close(), [])

  const waiting = queue === 'waiting' || queue === 'connecting'
  return (
    <main className="start online">
      <header className="builder__header">
        <h1 className="builder__title">Play online</h1>
        <button type="button" className="button" onClick={onBack}>
          Back
        </button>
      </header>
      <p className="start__tagline">
        Find a ranked opponent, or make a room and send the link to a friend. The room runs the
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
              onPlay({
                code: saved.code,
                name: saved.name,
                garage: null,
                token: saved.token,
                ticket: null,
              })
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
          disabled={account !== null}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="start__pickers start__pickers--one">
        <GaragePicker label="Your garage" options={options} value={garage} onChange={setGarage} />
      </div>
      <section className="online__queue">
        <h2>Ranked</h2>
        {account ? (
          waiting ? (
            <div className="online__actions">
              <span className="online__status" role="status">
                Looking for an opponent… {waited}s
              </span>
              <button type="button" className="button" onClick={leaveQueue}>
                Cancel
              </button>
            </div>
          ) : (
            <div className="online__actions">
              <button
                type="button"
                className="button button--primary button--big"
                onClick={findOpponent}
              >
                Find an opponent
              </button>
              <span className="online__status">
                Rating {account.data.profile.rating}. Wins and losses move it.
              </span>
            </div>
          )
        ) : (
          <p className="online__status">
            Create a player on the start screen to play ranked matches.
          </p>
        )}
      </section>
      <section className="online__queue">
        <h2>With a friend</h2>
        <div className="online__actions">
          <button
            type="button"
            className="button button--primary button--big"
            disabled={busy || waiting}
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
            <button type="submit" className="button button--big" disabled={waiting}>
              Join
            </button>
          </form>
        </div>
      </section>
      {error && (
        <p className="online__error" role="alert">
          {error}
        </p>
      )}
    </main>
  )
}
