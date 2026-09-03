import { useState } from 'react'
import type { MatchState, PlayerIndex } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'
import { PackDialog } from './PackDialog.tsx'

interface ResultScreenProps {
  state: MatchState
  winner: PlayerIndex
  names: readonly [string, string]
  /** Headline, such as "You win" or "Player 2 wins". */
  title: string
  /** Packs this match added to the collection. */
  packsEarned: number
  onRematch: () => void
  onNewMatch: () => void
}

function noun(n: number): string {
  return n === 1 ? 'pack' : 'packs'
}

export function ResultScreen({
  state,
  winner,
  names,
  title,
  packsEarned,
  onRematch,
  onNewMatch,
}: ResultScreenProps) {
  const loser: PlayerIndex = winner === 0 ? 1 : 0
  // The pop-up shows itself once the packs are awarded and comes back on request.
  const [dismissed, setDismissed] = useState(false)
  // Packs still waiting, as reported by the pop-up; unknown until it closes.
  const [waiting, setWaiting] = useState<number | null>(null)
  const showPacks = packsEarned > 0 && !dismissed
  const closePacks = (remaining: number) => {
    setWaiting(remaining)
    setDismissed(true)
  }
  return (
    <>
      <main className="result" inert={showPacks}>
        <h1 className="result__title">{title}</h1>
        <p className="result__sub">Three pink slips in {Math.ceil(state.turn.number / 2)} turns.</p>
        {packsEarned > 0 && (
          <p className="result__packs">
            {waiting === null
              ? `This match earned ${packsEarned} ${noun(packsEarned)}.`
              : waiting === 0
                ? 'All packs opened.'
                : `${waiting} ${noun(waiting)} waiting.`}{' '}
            {waiting !== 0 && (
              <button
                type="button"
                className="button button--small"
                onClick={() => setDismissed(false)}
              >
                Open packs
              </button>
            )}
          </p>
        )}
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
      {showPacks && <PackDialog earned={packsEarned} onClose={closePacks} />}
    </>
  )
}
