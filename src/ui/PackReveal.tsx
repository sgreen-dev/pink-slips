import { useEffect } from 'react'
import type { Pack } from '../collection/collection.ts'
import { getCar } from '../data/cars.ts'
import { useSound } from './sound/useSound.ts'
import { CarCard } from './CarCard.tsx'
import { ModCard } from './ModCard.tsx'

interface PackRevealProps {
  pack: Pack
  /** Ids the player did not own before this pack. */
  fresh: ReadonlySet<string>
}

/** The five cards of an opened pack, sliding in one after another, with New badges and finishes. */
export function PackReveal({ pack, fresh }: PackRevealProps) {
  const sound = useSound()
  useEffect(() => {
    sound.play('sparkle')
    const rare =
      pack.cars.some((card) => card.variant === 'holo' || getCar(card.id).tier === 'hyper') ||
      pack.mods.some((card) => card.variant === 'holo')
    if (rare) sound.play('shimmer')
    // One reveal, one sound: the pack is the identity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack])
  return (
    <div className="collection__reveal">
      {pack.cars.map((card, i) => (
        <div key={`${card.id}-${i}`} style={{ animationDelay: `${i * 0.15}s` }}>
          <CarCard
            carId={card.id}
            size="md"
            variant={card.variant}
            badge={fresh.has(card.id) ? 'New' : undefined}
          />
        </div>
      ))}
      {pack.mods.map((card, i) => (
        <div
          key={`${card.id}-${i}`}
          className="hand__slot"
          style={{ animationDelay: `${(pack.cars.length + i) * 0.15}s` }}
        >
          <ModCard modId={card.id} variant={card.variant} />
          {fresh.has(card.id) && <span className="hand__count">New</span>}
        </div>
      ))}
    </div>
  )
}
