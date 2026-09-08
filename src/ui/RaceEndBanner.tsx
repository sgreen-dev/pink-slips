import { getCar } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'
import type { RaceEnd } from './celebration.ts'

interface RaceEndBannerProps {
  raceEnd: RaceEnd
  /** "You win", "The CPU wins", or "Player 2 wins". */
  headline: string
  /** The first-match guide's finish step, shown above Continue (DESIGN.md 8). */
  note?: string
  onContinue: () => void
}

/**
 * The moment after the finish line: who won, which car changed hands, and the pink slip tally.
 * It stays up until Continue, so nobody loses it to a timer or a stray tap.
 */
export function RaceEndBanner({ raceEnd, headline, note, onContinue }: RaceEndBannerProps) {
  const captured = getCar(raceEnd.capturedCarId)

  return (
    <div className="raceend" role="dialog" aria-modal="true" aria-labelledby="raceend-title">
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
        {note && <p className="raceend__guide">{note}</p>}
        <button
          type="button"
          className="button button--primary button--big button--next"
          onClick={onContinue}
          autoFocus
        >
          Continue
        </button>
      </div>
    </div>
  )
}
