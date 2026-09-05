import { useContext, useRef, useState, type CSSProperties } from 'react'
import { loadCollection } from '../collection/persist.ts'
import { LEVELS, LEVEL_BLURB, LEVEL_LABEL, type Level } from '../cpu/index.ts'
import type { MatchConfig } from '../engine/index.ts'
import { AccountContext } from './account.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { GaragePicker } from './GaragePicker.tsx'
import type { Mode } from './Match.tsx'
import { MatchCounter } from './MatchCounter.tsx'
import type { PlayerView } from './PlayerDialog.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { SoundButton } from './sound/SoundButton.tsx'
import { loadGarages } from './storage.ts'

interface StartScreenProps {
  onStart: (
    mode: Mode,
    config: MatchConfig,
    names: [string, string],
    level: Level,
    stakes: boolean,
  ) => void
  onBuilder: () => void
  onCollection: () => void
  /** Absent when no room service is configured, which hides the online button. */
  onOnline?: () => void
  onProfile: () => void
  /** Opens the player pop-up; absent without a service. */
  onPlayer?: (view: PlayerView) => void
}

/** The start screen art, served from public/backgrounds. */
const BACKDROP = `${import.meta.env.BASE_URL}backgrounds/start-screen2.webp`

export function StartScreen({
  onStart,
  onBuilder,
  onCollection,
  onOnline,
  onProfile,
  onPlayer,
}: StartScreenProps) {
  const account = useContext(AccountContext)
  const [options] = useState<GarageOption[]>(() => garageOptions(loadGarages()))
  const [packs] = useState(() => loadCollection().packs)
  const rules = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<Mode>('cpu')
  const [level, setLevel] = useState<Level>('street')
  const [stakes, setStakes] = useState(false)
  // Stakes need a real opponent's collection to move cars with and a level that cannot be farmed.
  const stakesAllowed = mode === 'cpu' && level !== 'rookie'
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(1)
  const [confirmOut, setConfirmOut] = useState(false)
  const labels: [string, string] =
    mode === 'cpu' ? ['Your garage', 'CPU garage'] : ['Player 1 garage', 'Player 2 garage']
  const start = () => {
    const a = options[first]
    const b = options[second]
    if (!a || !b) return
    onStart(
      mode,
      {
        players: [
          { garage: a.cars, deck: a.deck },
          { garage: b.cars, deck: b.deck },
        ],
      },
      mode === 'cpu'
        ? [account?.data.profile.name ?? 'Player', `${LEVEL_LABEL[level]} CPU`]
        : ['Player 1', 'Player 2'],
      level,
      stakesAllowed && stakes,
    )
  }
  return (
    <main className="start">
      <div
        className="backdrop"
        aria-hidden="true"
        style={{ '--backdrop': `url(${BACKDROP})` } as CSSProperties}
      />
      <h1 className="start__title">Pink Slips</h1>
      <p className="start__tagline">
        Real cars drag race a quarter mile. Win the race, take the car. First to three pink slips
        wins.
      </p>
      {account ? (
        <p className="account">
          Playing as <strong>{account.data.profile.name}</strong> · Rating{' '}
          {account.data.profile.rating}
          <button type="button" className="button button--small" onClick={onProfile}>
            Profile
          </button>
          {confirmOut ? (
            <>
              <span className="account__note">You will need your recovery code to come back.</span>
              <button
                type="button"
                className="button button--small button--primary"
                onClick={account.signOut}
              >
                Sign out
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setConfirmOut(false)}
              >
                Stay
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => setConfirmOut(true)}
            >
              Sign out
            </button>
          )}
        </p>
      ) : onPlayer ? (
        <p className="account">
          <button type="button" className="button button--small" onClick={() => onPlayer('create')}>
            Create a player
          </button>
          <span className="account__note">
            to play ranked and keep your collection on any device
          </span>
          <button
            type="button"
            className="button button--small button--ghost"
            onClick={() => onPlayer('recover')}
          >
            I have a recovery code
          </button>
        </p>
      ) : null}
      <div className="start__modes" role="group" aria-label="Mode">
        <button
          type="button"
          className={`button ${mode === 'cpu' ? 'button--primary' : ''}`}
          aria-pressed={mode === 'cpu'}
          onClick={() => setMode('cpu')}
        >
          Play the CPU
        </button>
        <button
          type="button"
          className={`button ${mode === 'hotseat' ? 'button--primary' : ''}`}
          aria-pressed={mode === 'hotseat'}
          onClick={() => setMode('hotseat')}
        >
          Hotseat: two players, one screen
        </button>
        {onOnline && (
          <button type="button" className="button" onClick={onOnline}>
            Play online
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onBuilder}>
          Deck builder
        </button>
        <button type="button" className="button button--ghost" onClick={onCollection}>
          Collection{packs > 0 ? ` · ${packs} ${packs === 1 ? 'pack' : 'packs'} to open` : ''}
        </button>
        <RulesButton dialogRef={rules} />
        <SoundButton />
      </div>
      {mode === 'cpu' && (
        <div className="start__levels" role="group" aria-label="CPU level">
          {LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              className={`button button--small ${level === option ? 'button--primary' : ''}`}
              aria-pressed={level === option}
              onClick={() => setLevel(option)}
            >
              {LEVEL_LABEL[option]}
            </button>
          ))}
          <span className="start__level-note">{LEVEL_BLURB[level]}</span>
        </div>
      )}
      {mode === 'cpu' && (
        <div className="stakes">
          <label className="stakes__toggle">
            <input
              type="checkbox"
              checked={stakesAllowed && stakes}
              disabled={!stakesAllowed}
              onChange={(event) => setStakes(event.target.checked)}
            />
            Play for stakes
          </label>
          <span className="stakes__note">
            {stakesAllowed
              ? 'Captured cars change hands for real, both ways. Starter cars never do.'
              : 'Stakes need the Street or Pro CPU.'}
          </span>
        </div>
      )}
      <div className="start__pickers">
        <GaragePicker label={labels[0]} options={options} value={first} onChange={setFirst} />
        <GaragePicker label={labels[1]} options={options} value={second} onChange={setSecond} />
      </div>
      <button type="button" className="button button--primary button--big" onClick={start}>
        Start the match
      </button>
      <MatchCounter />
      <RulesDialog dialogRef={rules} />
    </main>
  )
}
