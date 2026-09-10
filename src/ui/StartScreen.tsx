import { useContext, useRef, useState } from 'react'
import { loadCollection } from '../collection/persist.ts'
import { stakesAllowed as allowStakes } from '../collection/stakes.ts'
import { LEVELS, LEVEL_BLURB, LEVEL_LABEL, type Level } from '../cpu/levels.ts'
import type { MatchConfig } from '../engine/index.ts'
import { AccountContext } from './account.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { Backdrop } from './Backdrop.tsx'
import { GaragePicker } from './GaragePicker.tsx'
import { RandomGarages } from './RandomGarages.tsx'
import { dealGarages } from './randomGarages.ts'
import type { GarageSpec } from '../data/garages.ts'
import { newSeed } from './seed.ts'
import type { Mode } from './Match.tsx'
import { MatchCounter } from './MatchCounter.tsx'
import type { PlayerView } from './PlayerDialog.tsx'
import { PrivacyDialog } from './PrivacyDialog.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { SoundButton } from './sound/SoundButton.tsx'
import { loadGarages } from '../browser/storage.ts'

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
  const [options] = useState<GarageOption[]>(() =>
    garageOptions(loadGarages(), loadCollection().owned),
  )
  const [packs] = useState(() => loadCollection().packs)
  const rules = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<Mode>('cpu')
  const [level, setLevel] = useState<Level>('street')
  const [stakes, setStakes] = useState(false)
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(1)
  // A garage the game deals rather than one that is owned (DESIGN.md 5). Null when off; a
  // reroll takes a new seed and deals both sides again, so the match stays symmetric.
  const [dealt, setDealt] = useState<[GarageSpec, GarageSpec] | null>(null)
  // A garage of your own on the CPU side stakes your collection against itself: every car you
  // win is a car you already hold, so a win only ever adds a duplicate. That is the same reason
  // hotseat cannot play for stakes (DESIGN.md 12), so a loaner is what the CPU has to race.
  const cpuGarageIsYours = options[second]?.custom === true
  const canStake = allowStakes({
    mode,
    level,
    cpuGarageIsOwn: cpuGarageIsYours,
    randomGarages: dealt !== null,
  })
  const [confirmOut, setConfirmOut] = useState(false)
  const labels: [string, string] =
    mode === 'cpu' ? ['Your garage', 'CPU garage'] : ['Player 1 garage', 'Player 2 garage']
  const start = () => {
    const picked = dealt
      ? [
          { garage: dealt[0].garage, deck: dealt[0].deck },
          { garage: dealt[1].garage, deck: dealt[1].deck },
        ]
      : [options[first], options[second]].map((o) => (o ? { garage: o.cars, deck: o.deck } : null))
    const [a, b] = picked
    if (!a || !b) return
    onStart(
      mode,
      { players: [a, b] },
      mode === 'cpu'
        ? [account?.data.profile.name ?? 'Player', `${LEVEL_LABEL[level]} CPU`]
        : ['Player 1', 'Player 2'],
      level,
      canStake && stakes,
    )
  }
  return (
    <main className="start">
      <Backdrop image={BACKDROP} />
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
                className="button button--small button--ghost"
                onClick={() => setConfirmOut(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className="button button--small button--primary"
                onClick={account.signOut}
              >
                Sign out
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
          className={`button ${mode === 'cpu' ? 'button--on' : ''}`}
          aria-pressed={mode === 'cpu'}
          onClick={() => setMode('cpu')}
        >
          Play the CPU
        </button>
        <button
          type="button"
          className={`button ${mode === 'hotseat' ? 'button--on' : ''}`}
          aria-pressed={mode === 'hotseat'}
          onClick={() => setMode('hotseat')}
        >
          Hotseat: two players, one screen
        </button>
      </div>
      {mode === 'cpu' && (
        <div className="start__levels" role="group" aria-label="CPU level">
          {LEVELS.map((option) => (
            <button
              key={option}
              type="button"
              className={`button button--small ${level === option ? 'button--on' : ''}`}
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
              checked={canStake && stakes}
              disabled={!canStake}
              onChange={(event) => setStakes(event.target.checked)}
            />
            Play for stakes
          </label>
          <span className="stakes__note">
            {canStake
              ? 'Captured cars change hands for real, both ways. Loaner cars never do.'
              : dealt
                ? 'Dealt garages are not owned, so their cars can be neither won nor lost.'
                : cpuGarageIsYours && mode === 'cpu' && level !== 'rookie'
                  ? 'Stakes need a loaner on the CPU side. Your own garage would only win you cards you already hold.'
                  : 'Stakes need the Street or Pro CPU.'}
          </span>
        </div>
      )}
      {/* The control sits with the pickers it replaces, since it acts on them (DESIGN.md 8). */}
      <div className="start__deal">
        <button
          type="button"
          className={`button button--small ${dealt ? 'button--on' : ''}`}
          aria-pressed={dealt !== null}
          onClick={() => setDealt(dealt ? null : dealGarages(newSeed()))}
        >
          Random garages
        </button>
        <span className="start__level-note">
          {dealt
            ? 'Both sides race a garage the game dealt. Nothing here is from your collection.'
            : 'Race something you did not build: five cars and a deck, dealt to both sides.'}
        </span>
      </div>
      {dealt ? (
        <RandomGarages
          garages={dealt}
          labels={labels}
          onReroll={() => setDealt(dealGarages(newSeed()))}
        />
      ) : (
        <div className="start__pickers">
          <GaragePicker label={labels[0]} options={options} value={first} onChange={setFirst} />
          <GaragePicker label={labels[1]} options={options} value={second} onChange={setSecond} />
        </div>
      )}
      <button type="button" className="button button--primary button--big" onClick={start}>
        Start the match
      </button>
      {/* Everything that leaves this screen, plus the utilities. Kept out of the Mode group so a
          screen reader does not announce the speaker as a way to play (DESIGN.md 8). */}
      <div className="start__nav">
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
        <PrivacyDialog />
        <SoundButton />
      </div>
      <MatchCounter />
      <RulesDialog dialogRef={rules} />
    </main>
  )
}
