import type { CSSProperties } from 'react'

/** A screen's backdrop, fixed behind everything under a dark wash; nothing when there is none. */
export function Backdrop({ image }: { image: string | null }) {
  if (!image) return null
  return (
    <div
      className="backdrop"
      aria-hidden="true"
      style={{ '--backdrop': `url(${image})` } as CSSProperties}
    />
  )
}
