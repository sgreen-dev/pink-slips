import type { CSSProperties } from 'react'
import { cardBackUrl } from './artwork.ts'

/** The back of a card: the owner's card back when there is one, else a plain dark card. */
export function CardBack({ size = 'sm' }: { size?: 'xs' | 'sm' | 'md' }) {
  const back = cardBackUrl()
  return (
    <div
      className={`card-back card-back--${size}`}
      aria-hidden="true"
      style={back ? ({ '--back': `url(${back})` } as CSSProperties) : undefined}
    />
  )
}
