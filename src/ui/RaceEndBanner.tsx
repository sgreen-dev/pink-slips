import { useEffect } from 'react'
import { getCar } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'
import type { RaceEnd } from './celebration.ts'

interface RaceEndBannerProps {
  raceEnd: RaceEnd
  /** "You win", "The CPU wins", or "Player 2 wins". */
  headline: string
  onContinue: () => void
}

/** The moment after the finish line: who won, which car changed hands, and the pink slip tally. */
export function RaceEndBanner({ raceEnd, headline, onContinue }: RaceEndBannerProps) {
  const captured = getCar(raceEnd.capturedCarId)

  // Escape continues too; Enter and Space work through the focused button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onContinue()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onContinue])

  return (
    <div
      className="raceend"
      role="dialog"
      aria-modal="true"
      aria-labelledby="raceend-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onContinue()
      }}
    >
      <div className="raceend__panel">
        <p className="raceend__kicker">Race {raceEnd.race}</p>
        <h2 id="raceend-title" className="raceend__title">
          {raceEnd.matchOver ? `${headline} the match` : headline}
        </h2>
        <div className="raceend__card">
          <CarCard carId={raceEnd.capturedCarId} size="md" badge="Pink slip" />
        </div>
        <p className="raceend__line">The {captured.name} changes hands.</p>
        <p className="raceend__tally">
          Pink slips {raceEnd.slips} of {TUNABLES.pinkSlipsToWin}
        </p>
        <button
          type="button"
          className="button button--primary button--big"
          onClick={onContinue}
          autoFocus
        >
          Continue
        </button>
      </div>
    </div>
  )
}
