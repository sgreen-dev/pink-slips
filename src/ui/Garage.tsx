import { useEffect, useRef } from 'react'
import type { PlayerState } from '../engine/index.ts'
import { cardBackUrl } from './artwork.ts'
import { CardBack } from './CardBack.tsx'
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
  /** The race in progress; a new race scrolls the row back to its staged car. */
  raceNumber?: number
}

export function Garage({
  player,
  name,
  intents,
  selection,
  onCar,
  size = 'sm',
  handCount,
  raceNumber,
}: GarageProps) {
  const row = useRef<HTMLDivElement | null>(null)
  // The staged car leads the row; when it changes, or a new race begins, bring it back into
  // view on a phone, where the row scrolls (DESIGN.md 8, Board order).
  useEffect(() => {
    const el = row.current
    if (!el || typeof el.scrollTo !== 'function') return
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: 0, behavior: reduced ? 'auto' : 'smooth' })
  }, [player.stagedCarId, raceNumber])
  return (
    <section className="garage">
      <header className="garage__header">
        <span className="garage__name">{name}</span>
        <span className="garage__meta">
          Pink slips {player.pinkSlips.length}/3 · Hand {handCount ?? player.hand.length} · Deck{' '}
          {player.deck.length}
          {handCount !== undefined && cardBackUrl() && (
            <span className="garage__fan" aria-hidden="true">
              {Array.from({ length: Math.min(5, handCount) }, (_, i) => (
                <CardBack key={i} size="xs" />
              ))}
            </span>
          )}
        </span>
      </header>
      <div className="garage__cars" ref={row}>
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
