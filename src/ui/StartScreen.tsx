import { useRef, useState } from 'react'
import { loadCollection } from '../collection/persist.ts'
import { LEVELS, LEVEL_BLURB, LEVEL_LABEL, type Level } from '../cpu/index.ts'
import type { MatchConfig } from '../engine/index.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { GaragePicker } from './GaragePicker.tsx'
import type { Mode } from './Match.tsx'
import { MatchCounter } from './MatchCounter.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { loadGarages } from './storage.ts'

interface StartScreenProps {
  onStart: (mode: Mode, config: MatchConfig, names: [string, string], level: Level) => void
  onBuilder: () => void
  onCollection: () => void
  /** Absent when no room service is configured, which hides the online button. */
  onOnline?: () => void
}

export function StartScreen({ onStart, onBuilder, onCollection, onOnline }: StartScreenProps) {
  const [options] = useState<GarageOption[]>(() => garageOptions(loadGarages()))
  const [packs] = useState(() => loadCollection().packs)
  const rules = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<Mode>('cpu')
  const [level, setLevel] = useState<Level>('street')
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(1)
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
      mode === 'cpu' ? ['Player', `${LEVEL_LABEL[level]} CPU`] : ['Player 1', 'Player 2'],
      level,
    )
  }
  return (
    <main className="start">
      <h1 className="start__title">Pink Slips</h1>
      <p className="start__tagline">
        Real cars drag race a quarter mile. Win the race, take the car. First to three pink slips
        wins.
      </p>
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
