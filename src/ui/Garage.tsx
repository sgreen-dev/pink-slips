import { useEffect, useRef, type Ref } from 'react'
import type { PlayerState } from '../engine/index.ts'
import { cardBackUrl } from './artwork.ts'
import { CardBack } from './CardBack.tsx'
import { CarCard, type CardSize } from './CarCard.tsx'
import { Plate } from './Plate.tsx'
import { stagedFirst, type CarIntent, type Selection } from './interaction.ts'
import { scrollRowBack, TURN_END_RESET_MS } from './scroll.ts'

interface GarageProps {
  player: PlayerState
  name: string
  /** The player's laps, shown as a plate beside the name and on the card backs. */
  plate?: number
  /** Cards that respond to a click, keyed by car id. Omit for a view-only garage. */
  intents?: Map<string, CarIntent>
  selection?: Selection
  onCar?: (carId: string, intent: CarIntent) => void
  /** A tap on a car with no intent, so the board can say why it is not a target. */
  onOther?: (carId: string) => void
  size?: CardSize
  /** Show the hand as a count only, for the opponent. */
  handCount?: number
  /** The race in progress; a new race scrolls the row back to its staged car. */
  raceNumber?: number
  /** Counts the viewer's turns ended; each one scrolls the row back to its start. */
  turnsEnded?: number
  /** The board's handle on this garage, for the camera. */
  ref?: Ref<HTMLElement>
}

export function Garage({
  player,
  name,
  plate = 0,
  intents,
  selection,
  onCar,
  onOther,
  size = 'sm',
  handCount,
  raceNumber,
  turnsEnded,
  ref,
}: GarageProps) {
  const row = useRef<HTMLDivElement | null>(null)
  // The staged car leads the row; when it changes, a new race begins, or the viewer's turn ends,
  // bring the row back to its start on a phone, where it scrolls (DESIGN.md 8, Board order). A
  // turn's end waits the camera's beat, so the advance that ended it is seen first.
  const ended = useRef(turnsEnded)
  useEffect(() => {
    const afterTurn = ended.current !== turnsEnded
    ended.current = turnsEnded
    const timer = setTimeout(() => scrollRowBack(row.current), afterTurn ? TURN_END_RESET_MS : 0)
    return () => clearTimeout(timer)
  }, [player.stagedCarId, raceNumber, turnsEnded])
  return (
    <section className="garage" ref={ref}>
      <header className="garage__header">
        <span className="garage__name">
          {name}
          <Plate laps={plate} />
        </span>
        <span className="garage__meta">
          Pink slips {player.pinkSlips.length}/3 · Hand {handCount ?? player.hand.length} · Deck{' '}
          {player.deck.length}
          {handCount !== undefined && cardBackUrl() && (
            <span className="garage__fan" aria-hidden="true">
              {Array.from({ length: Math.min(5, handCount) }, (_, i) => (
                <CardBack key={i} size="xs" plate={plate} />
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
              onClick={
                intent && onCar
                  ? () => onCar(car.carId, intent)
                  : onOther
                    ? () => onOther(car.carId)
                    : undefined
              }
            />
          )
        })}
      </div>
    </section>
  )
}
