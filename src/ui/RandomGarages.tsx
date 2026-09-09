import type { GarageSpec } from '../data/garages.ts'
import { CarCard } from './CarCard.tsx'
import { tierLine } from './randomGarages.ts'

interface RandomGaragesProps {
  /** One garage per seat, or one alone when only this seat is dealt, as online. */
  garages: readonly GarageSpec[]
  labels: readonly string[]
  onReroll: () => void
}

/**
 * The garages the game dealt, shown before the match so the player knows what they are taking
 * (DESIGN.md 5). Read-only: a dealt garage is not chosen, so there is nothing to pick and no
 * radio here. Rerolling deals again.
 */
export function RandomGarages({ garages, labels, onReroll }: RandomGaragesProps) {
  return (
    <div className="dealt">
      {garages.map((garage, index) => (
        <section key={index} className="dealt__garage">
          <h2 className="dealt__label">{labels[index] ?? 'Garage'}</h2>
          <p className="dealt__shape">{tierLine(garage.garage)}</p>
          <div className="dealt__cars">
            {garage.garage.map((carId) => (
              <CarCard key={carId} carId={carId} size="sm" />
            ))}
          </div>
        </section>
      ))}
      <p className="dealt__note">
        Dealt from the whole roster, the same draw the balance runs race. These cars are not in your
        collection, so this match cannot be played for stakes.
      </p>
      <button type="button" className="button" onClick={onReroll}>
        Deal again
      </button>
    </div>
  )
}
