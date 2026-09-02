import type { MatchState, PlayerIndex } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'

interface ResultScreenProps {
  state: MatchState
  winner: PlayerIndex
  names: readonly [string, string]
  /** Headline, such as "You win" or "Player 2 wins". */
  title: string
  onRematch: () => void
  onNewMatch: () => void
}

export function ResultScreen({
  state,
  winner,
  names,
  title,
  onRematch,
  onNewMatch,
}: ResultScreenProps) {
  const loser: PlayerIndex = winner === 0 ? 1 : 0
  return (
    <main className="result">
      <h1 className="result__title">{title}</h1>
      <p className="result__sub">Three pink slips in {Math.ceil(state.turn.number / 2)} turns.</p>
      <section className="result__slips">
        <h2>{names[winner]}&rsquo;s pink slips</h2>
        <div className="result__cards">
          {state.players[winner].pinkSlips.map((carId) => (
            <CarCard key={carId} carId={carId} size="md" badge="Pink slip" />
          ))}
        </div>
      </section>
      {state.players[loser].pinkSlips.length > 0 && (
        <section className="result__slips result__slips--loser">
          <h2>{names[loser]} took</h2>
          <div className="result__cards">
            {state.players[loser].pinkSlips.map((carId) => (
              <CarCard key={carId} carId={carId} size="sm" badge="Pink slip" />
            ))}
          </div>
        </section>
      )}
      <div className="result__actions">
        <button
          type="button"
          className="button button--primary button--big"
          onClick={onRematch}
          autoFocus
        >
          Rematch
        </button>
        <button type="button" className="button button--big" onClick={onNewMatch}>
          New match
        </button>
      </div>
    </main>
  )
}
