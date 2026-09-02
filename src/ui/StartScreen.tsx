import { useState } from 'react'
import type { MatchConfig } from '../engine/index.ts'
import { garageOptions, type GarageOption } from './builder.ts'
import { CarCard } from './CarCard.tsx'
import type { Mode } from './Match.tsx'
import { loadGarages } from './storage.ts'

interface StartScreenProps {
  onStart: (mode: Mode, config: MatchConfig, names: [string, string]) => void
  onBuilder: () => void
}

function GaragePicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly GarageOption[]
  value: number
  onChange: (index: number) => void
}) {
  return (
    <fieldset className="picker">
      <legend className="picker__legend">{label}</legend>
      {options.map((option, index) => (
        <label
          key={option.id}
          className={`picker__option ${index === value ? 'picker__option--selected' : ''}`}
        >
          <input
            type="radio"
            name={label}
            checked={index === value}
            onChange={() => onChange(index)}
          />
          <span className="picker__title">{option.name}</span>
          <span className="picker__style">{option.style}</span>
          <span className="picker__cars">
            {option.cars.map((carId) => (
              <CarCard key={carId} carId={carId} size="sm" />
            ))}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function StartScreen({ onStart, onBuilder }: StartScreenProps) {
  const [options] = useState<GarageOption[]>(() => garageOptions(loadGarages()))
  const [mode, setMode] = useState<Mode>('cpu')
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
      mode === 'cpu' ? ['Player', 'CPU'] : ['Player 1', 'Player 2'],
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
        <button type="button" className="button button--ghost" onClick={onBuilder}>
          Deck builder
        </button>
      </div>
      <div className="start__pickers">
        <GaragePicker label={labels[0]} options={options} value={first} onChange={setFirst} />
        <GaragePicker label={labels[1]} options={options} value={second} onChange={setSecond} />
      </div>
      <button type="button" className="button button--primary button--big" onClick={start}>
        Start the match
      </button>
    </main>
  )
}
