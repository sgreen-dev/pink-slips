import { useEffect, useRef, type ReactNode } from 'react'

interface CalloutProps {
  /** Where the pointer faces: up at the garage, down at the buttons and hand. */
  toward: 'up' | 'down'
  /** Gold for the guide; the correction colour for a refused play. */
  tone?: 'guide' | 'notice'
  text: string
  /** The action buttons under the text. */
  children?: ReactNode
}

/**
 * The one callout box the guide and the refused-play notice share (DESIGN.md 8): in the flow of
 * the board under the prompt, and it brings itself into view when its text changes, which
 * matters on a phone, where the board scrolls.
 */
export function Callout({ toward, tone = 'guide', text, children }: CalloutProps) {
  const box = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el || typeof el.scrollIntoView !== 'function') return
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [text])
  return (
    <aside ref={box} className={`guide guide--${toward} guide--${tone}`} role="status">
      <p className="guide__text">{text}</p>
      {children && <div className="guide__actions">{children}</div>}
    </aside>
  )
}
