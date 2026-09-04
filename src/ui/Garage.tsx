import type { PlayerState } from '../engine/index.ts'
import { CarCard, type CardSize } from './CarCard.tsx'
import { stagedFirst, type CarIntent, type Selection } from './interaction.ts'

interface GarageProps {
  player: PlayerState
  name: string
  /** Cards that respond to a click, keyed by car id. Omit for a view-only garage. */
  intents?: Map<string, CarIntent>
  selection?: Selection
  onCar?: (carId: string, intent: CarIntent) => void
  size?: CardSize
  /** Show the hand as a count only, for the opponent. */
  handCount?: number
}

export function Garage({
  player,
  name,
  intents,
  selection,
  onCar,
  size = 'sm',
  handCount,
}: GarageProps) {
  return (
    <section className="garage">
      <header className="garage__header">
        <span className="garage__name">{name}</span>
        <span className="garage__meta">
          Pink slips {player.pinkSlips.length}/3 · Hand {handCount ?? player.hand.length} · Deck{' '}
          {player.deck.length}
        </span>
      </header>
      <div className="garage__cars">
        {stagedFirst(player.garage, player.stagedCarId).map((car) => {
          const intent = intents?.get(car.carId)
          const selected =
            selection?.kind === 'towFrom' && selection.fromCarId === car.carId ? true : undefined
          return (
            <CarCard
              key={car.carId}
              carId={car.carId}
              state={car}
              size={size}
              staged={player.stagedCarId === car.carId}
              target={intent !== undefined}
              selected={selected}
              onClick={intent && onCar ? () => onCar(car.carId, intent) : undefined}
            />
          )
        })}
      </div>
    </section>
  )
}
