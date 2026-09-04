import { useState } from 'react'
import { VARIANT_LABEL, type Variant } from '../collection/collection.ts'
import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { TIER_LABEL } from '../data/tiers.ts'
import { CAR_TYPE_LABEL } from '../data/types.ts'
import { fuelCost, type CarState } from '../engine/index.ts'
import { initialArtState, nextArtState, showsImage } from './artState.ts'
import { useVariant } from './variants.ts'

export type CardSize = 'sm' | 'md' | 'lg'

interface CarCardProps {
  carId: string
  /** Fuel, wear, and parts to show. Omit for a plain card. */
  state?: CarState
  size?: CardSize
  staged?: boolean
  /** Clicking this card does something right now. */
  target?: boolean
  selected?: boolean
  onClick?: () => void
  /** Small label in the corner, such as "Pink slip". */
  badge?: string
  /** Shown faded, such as a card the player does not own yet. */
  dimmed?: boolean
  /** Foil or holo finish. Without it the card asks the nearest VariantContext. */
  variant?: Variant
}

/** A stylized car silhouette, tinted by the card's type. Illustrated art is a post-v1 item. */
function Silhouette() {
  return (
    <svg className="card__silhouette" viewBox="0 0 100 50" aria-hidden="true">
      <path
        className="card__silhouette-body"
        d="M5 35 L9 27 Q13 23 24 22 L36 13 Q40 10 48 10 L66 10 Q74 10 80 16 L88 25 L95 28 L95 35 Z"
      />
      <path className="card__silhouette-glass" d="M38 14 L48 13 L48 22 L31 22 Z" />
      <path className="card__silhouette-glass" d="M52 13 L64 13 Q70 13 74 17 L78 22 L52 22 Z" />
      <circle className="card__silhouette-wheel" cx="26" cy="37" r="7" />
      <circle className="card__silhouette-wheel" cx="76" cy="37" r="7" />
      <circle className="card__silhouette-hub" cx="26" cy="37" r="2.5" />
      <circle className="card__silhouette-hub" cx="76" cy="37" r="2.5" />
    </svg>
  )
}

function Tokens({ state }: { state: CarState }) {
  const cost = fuelCost(state)
  const pips = Math.max(cost, state.fuel)
  return (
    <div className="card__tokens">
      <span className="card__fuel" title={`Fuel ${state.fuel} of ${cost}`}>
        {Array.from({ length: pips }, (_, i) => (
          <span
            key={i}
            className={`pip ${i < state.fuel ? 'pip--fuel' : 'pip--empty'} ${i >= cost ? 'pip--extra' : ''}`}
          />
        ))}
      </span>
      {state.wear > 0 && (
        <span className="card__wear" title={`Wear ${state.wear}`}>
          {'✕'.repeat(state.wear)}
        </span>
      )}
      {state.parts.length > 0 && (
        <span className="card__parts">
          {state.parts.map((modId, i) => (
            <span key={`${modId}-${i}`} className="chip" title={getMod(modId).text}>
              {getMod(modId).name}
            </span>
          ))}
        </span>
      )}
      {state.tractionShield && (
        <span className="chip chip--shield" title={getMod('launch-control').text}>
          Shield
        </span>
      )}
    </div>
  )
}

export function CarCard({
  carId,
  state,
  size = 'md',
  staged,
  target,
  selected,
  onClick,
  badge,
  dimmed,
  variant: variantProp,
}: CarCardProps) {
  const car = getCar(carId)
  const variant = useVariant(carId, variantProp)
  const [art, setArt] = useState(() => initialArtState(car.imageUrl))
  const cost = state ? fuelCost(state) : undefined
  const className = [
    'card',
    `card--${car.type}`,
    `card--${size}`,
    staged ? 'card--staged' : '',
    target ? 'card--target' : '',
    selected ? 'card--selected' : '',
    onClick ? 'card--clickable' : '',
    dimmed ? 'card--unowned' : '',
    variant === 'base' ? '' : `card--${variant}`,
  ]
    .filter(Boolean)
    .join(' ')
  const body = (
    <>
      <div className="card__body">
        <div className="card__name" title={car.name}>
          {car.name}
        </div>
        <div className="card__art">
          <Silhouette />
          {showsImage(art) && (
            <img
              className={`card__image ${art === 'loaded' ? 'card__image--loaded' : ''}`}
              src={import.meta.env.BASE_URL + car.imageUrl.slice(1)}
              alt={car.name}
              loading="lazy"
              decoding="async"
              onLoad={() => setArt((s) => nextArtState(s, 'load'))}
              onError={() => setArt((s) => nextArtState(s, 'error'))}
            />
          )}
          <span className="card__type">{CAR_TYPE_LABEL[car.type]}</span>
        </div>
        <dl className="card__stats">
          <dt>HP</dt>
          <dd>{car.hp}</dd>
          <dt>Weight</dt>
          <dd>{car.weightLb.toLocaleString()} lb</dd>
          <dt>0–60</dt>
          <dd>{car.zeroToSixtySec}s</dd>
          <dt>Top</dt>
          <dd>{car.topSpeedMph} mph</dd>
        </dl>
        <div className="card__footer">
          <span>{TIER_LABEL[car.tier]}</span>
          <span>
            Fuel {cost ?? fuelCost({ carId, fuel: 0, wear: 0, parts: [], tractionShield: false })}
          </span>
        </div>
      </div>
      {state && <Tokens state={state} />}
      {staged && <span className="card__badge card__badge--staged">Staged</span>}
      {badge && <span className="card__badge">{badge}</span>}
      {variant !== 'base' && (
        <span className={`card__variant card__variant--${variant}`}>{VARIANT_LABEL[variant]}</span>
      )}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-pressed={selected}>
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}
