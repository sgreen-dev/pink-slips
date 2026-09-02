import { useState } from 'react'
import { STARTERS } from '../data/starters.ts'
import type { MatchConfig } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'

interface StartScreenProps {
  onStart: (config: MatchConfig, names: [string, string]) => void
}

function StarterPicker({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (index: number) => void
}) {
  return (
    <fieldset className="picker">
      <legend className="picker__legend">{label}</legend>
      {STARTERS.map((starter, index) => (
        <label
          key={starter.id}
          className={`picker__option ${index === value ? 'picker__option--selected' : ''}`}
        >
          <input
            type="radio"
            name={label}
            checked={index === value}
            onChange={() => onChange(index)}
          />
          <span className="picker__title">{starter.name}</span>
          <span className="picker__style">{starter.style}</span>
          <span className="picker__cars">
            {starter.cars.map((carId) => (
              <CarCard key={carId} carId={carId} size="sm" />
            ))}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [first, setFirst] = useState(0)
  const [second, setSecond] = useState(1)
  const start = () => {
    const a = STARTERS[first]
    const b = STARTERS[second]
    if (!a || !b) return
    onStart(
      {
        players: [
          { garage: a.cars, deck: a.deck },
          { garage: b.cars, deck: b.deck },
        ],
      },
      ['Player 1', 'Player 2'],
    )
  }
  return (
    <main className="start">
      <h1 className="start__title">Pink Slips</h1>
      <p className="start__tagline">
        Real cars drag race a quarter mile. Win the race, take the car. First to three pink slips
        wins.
      </p>
      <div className="start__modes">
        <button type="button" className="button button--primary" disabled>
          Hotseat: two players, one screen
        </button>
        <span className="start__soon">Play against the CPU arrives in the next phase.</span>
      </div>
      <div className="start__pickers">
        <StarterPicker label="Player 1 garage" value={first} onChange={setFirst} />
        <StarterPicker label="Player 2 garage" value={second} onChange={setSecond} />
      </div>
      <button type="button" className="button button--primary button--big" onClick={start}>
        Start the match
      </button>
    </main>
  )
}
