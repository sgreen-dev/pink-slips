import type { CSSProperties } from 'react'
import { cardBackUrl } from './artwork.ts'

/**
 * The back of a card: the owner's card back when there is one, else a plain dark card. A lap
 * plate on it names the holder's laps (DESIGN.md 12).
 */
export function CardBack({
  size = 'xs',
  plate = 0,
}: {
  /** Only xs is drawn; the type says so rather than offering sizes with no rule behind them. */
  size?: 'xs'
  plate?: number
}) {
  const back = cardBackUrl()
  return (
    <div
      className={`card-back card-back--${size}`}
      aria-hidden="true"
      style={back ? ({ '--back': `url(${back})` } as CSSProperties) : undefined}
    >
      {plate > 0 && <span className="card-back__plate">{plate}</span>}
    </div>
  )
}
