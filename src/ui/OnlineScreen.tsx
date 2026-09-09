import { useContext, useEffect, useRef, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import type { PlayerConfig } from '../engine/index.ts'
import { MAX_NAME_LENGTH } from '../protocol/messages.ts'
import { AccountContext, QueueClient, queueUrl, type QueueStatus } from './account.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { GaragePicker } from './GaragePicker.tsx'
import { RandomGarages } from './RandomGarages.tsx'
import { dealGarage } from './randomGarages.ts'
import type { GarageSpec } from '../data/garages.ts'
import { newSeed } from './seed.ts'
import {
  clearOnlineSeat,
  createRoom,
  loadOnlineSeat,
  normalizeCode,
  type OnlineSeat,
} from './online.ts'
import { loadGarages } from '../browser/storage.ts'
import { loadCollection } from '../collection/persist.ts'

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
  /** The player's stakes toggle, sent with the join and the queue. */
  stakes: boolean
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
  const rules = useRef<HTMLDialogElement>(null)
  const [options] = useState<GarageOption[]>(() =>
    garageOptions(loadGarages(), loadCollection().owned),
  )
  const [saved, setSaved] = useState<OnlineSeat | null>(() => loadOnlineSeat())
  const [name, setName] = useState(account?.data.profile.name ?? saved?.name ?? 'Player')
  const [garage, setGarage] = useState(0)
  // A garage the game deals for this seat alone: the other seat is a person who picks their own
  // (DESIGN.md 5). Not owned, so it cannot play for stakes and cannot queue for a rating.
  const [dealt, setDealt] = useState<GarageSpec | null>(null)
  const [code, setCode] = useState(prefillCode ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stakes, setStakes] = useState(false)
  const [queue, setQueue] = useState<QueueStatus | null>(null)
  const [waited, setWaited] = useState(0)
  const queueClient = useRef<QueueClient | null>(null)

  const cleanName = name.trim().slice(0, MAX_NAME_LENGTH) || 'Player'
  const config = (): PlayerConfig | null => {
    if (dealt) return { garage: dealt.garage, deck: dealt.deck }
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
    onPlay({ code: fresh, name: cleanName, garage: config(), token: null, ticket: null, stakes })
  }
  const join = () => {
    const clean = normalizeCode(code)
    if (!clean) {
      setError('A room code is six letters and numbers, like ABC234.')
      return
    }
    onPlay({ code: clean, name: cleanName, garage: config(), token: null, ticket: null, stakes })
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
    const client = new QueueClient(queueUrl(endpoint, account.token, stakes), {
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
          stakes,
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
      <Backdrop image={backdropUrl('online')} />
      <header className="builder__header">
        <span className="board__brand">Pink Slips</span>
        <h1 className="builder__title">Play online</h1>
        <RulesButton dialogRef={rules} label="Rules" small />
        <button type="button" className="button" onClick={onBack}>
          Back to start
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
                stakes: false,
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
        {/* The control sits with the picker it replaces, since it acts on it (DESIGN.md 8). */}
        <div className="start__deal">
          <button
            type="button"
            className={`button button--small ${dealt ? 'button--on' : ''}`}
            aria-pressed={dealt !== null}
            onClick={() => {
              const next = dealt ? null : dealGarage(newSeed())
              setDealt(next)
              if (next) setStakes(false)
            }}
          >
            Random garage
          </button>
          <span className="online__status">
            {dealt
              ? 'Dealt from the whole roster. Not from your collection, so no stakes and no rating.'
              : 'Race something you did not build, in a room with a friend.'}
          </span>
        </div>
        {dealt ? (
          <RandomGarages
            garages={[dealt]}
            labels={['Your garage']}
            onReroll={() => setDealt(dealGarage(newSeed()))}
          />
        ) : (
          <GaragePicker label="Your garage" options={options} value={garage} onChange={setGarage} />
        )}
      </div>
      {account && (
        <div className="stakes">
          <label className="stakes__toggle">
            <input
              type="checkbox"
              checked={stakes && !dealt}
              disabled={dealt !== null}
              onChange={(event) => setStakes(event.target.checked)}
            />
            Play for stakes
          </label>
          <span className="stakes__note">
            {dealt
              ? 'A dealt garage is not owned, so its cars can be neither won nor lost.'
              : `Captured cars change hands for real, both ways; loaner cars never do. Both players need
            it on.`}
          </span>
        </div>
      )}
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
                disabled={dealt !== null}
                onClick={findOpponent}
              >
                Find an opponent
              </button>
              <span className="online__status">
                {dealt
                  ? 'A rating measures the garage you built as well as how you play, so a dealt one races friends only.'
                  : `Rating ${account.data.profile.rating}. Wins and losses move it.`}
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
      <RulesDialog dialogRef={rules} />
    </main>
  )
}
