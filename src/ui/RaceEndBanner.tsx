import { isStakedCar } from '../collection/stakes.ts'
import { getCar } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { CarCard } from './CarCard.tsx'
import type { RaceEnd } from './celebration.ts'

/**
 * What taking a car as a pink slip means for it (backlog U38). Without stakes it only sits out the
 * rest of the match: the banner used to say it "changes hands", which read as losing it for good.
 * With stakes it changes hands for real when the match ends, unless it is a loaner car or a
 * keepsake in chrome, which stakes never move (DESIGN.md 12).
 */
export type CaptureFate = 'match' | 'moves' | 'loaner' | 'keepsake'

export function captureFate(carId: string, stakes: boolean, keepsake: boolean): CaptureFate {
  if (!stakes) return 'match'
  if (!isStakedCar(carId)) return 'loaner'
  if (keepsake) return 'keepsake'
  return 'moves'
}

function captureLine(name: string, fate: CaptureFate): string {
  const out = `The ${name} is out for the rest of this match`
  switch (fate) {
    case 'match':
      return `${out}.`
    case 'moves':
      return `${out}, and with stakes on it changes hands for real when the match ends.`
    case 'loaner':
      return `${out}. It is a loaner car, so stakes never move it.`
    case 'keepsake':
      return `${out}. It is a keepsake, so stakes never move it.`
  }
}

interface RaceEndBannerProps {
  raceEnd: RaceEnd
  /** "You win", "The CPU wins", or "Player 2 wins". */
  headline: string
  /** What taking the car means for it: see `captureFate`. */
  fate: CaptureFate
  /** The first-match guide's finish step, shown above Continue (DESIGN.md 8). */
  note?: string
  onContinue: () => void
}

/**
 * The moment after the finish line: who won, which car was taken and what that means for it, and
 * the pink slip tally. It stays up until Continue, so nobody loses it to a timer or a stray tap.
 */
export function RaceEndBanner({ raceEnd, headline, fate, note, onContinue }: RaceEndBannerProps) {
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
        <p className="raceend__line">{captureLine(captured.name, fate)}</p>
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
