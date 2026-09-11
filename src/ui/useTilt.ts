import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { prefersReducedMotion } from './motion.ts'

/**
 * The lean a card takes towards the pointer (DESIGN.md 8).
 *
 * Everything it sets goes straight onto the element as custom properties, through a ref. Not
 * state: the collection mounts 126 cards at once, and backlog P2 measured a rebuild of that grid
 * at 57 to 73ms on a desktop and three to five times that on a phone, so a render per
 * `pointermove` would spend the whole frame budget on the one card being pointed at. The CSS in
 * `.card--tilt` reads the properties; nothing in React needs to know the card is leaning.
 *
 * `--rx` and `--ry` are the rotation, `--mx` and `--my` are where in the card the pointer is, as
 * a percentage, which the foil and holo sheets and the glare all point at so the finish agrees
 * with the lean about where the light is.
 */

/** How far a card leans at the very corner. Enough to read as a lean, little enough that the
 *  rows which scroll sideways — and so clip vertically — do not shave the raised corner. */
const MAX_DEG = 7

export interface Tilt {
  ref: (node: HTMLElement | null) => void
  onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerLeave: () => void
}

/**
 * @param block the class that turns the lean on, `card` or `mod`, since the two components style
 * it under their own name.
 */
export function useTilt(block: 'card' | 'mod'): Tilt {
  const node = useRef<HTMLElement | null>(null)
  const box = useRef<DOMRect | null>(null)
  const frame = useRef(0)
  const point = useRef({ x: 0, y: 0 })

  const ref = useCallback((el: HTMLElement | null) => {
    node.current = el
  }, [])

  // Measured once, when the pointer arrives, rather than per frame: reading a rect forces layout,
  // and the lean moves the card, so a rect read mid-lean would describe the leaning card and feed
  // its own rotation back in.
  const onPointerEnter = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse' || prefersReducedMotion()) return
    box.current = event.currentTarget.getBoundingClientRect()
  }, [])

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' || prefersReducedMotion()) return
      point.current = { x: event.clientX, y: event.clientY }
      // One write per frame however many moves arrive in it.
      if (frame.current) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        const el = node.current
        const rect = box.current
        if (!el || !rect || rect.width === 0 || rect.height === 0) return
        // -0.5 to 0.5 from the middle of the card.
        const x = (point.current.x - rect.left) / rect.width - 0.5
        const y = (point.current.y - rect.top) / rect.height - 0.5
        // Pointer right leans the right edge away, pointer up leans the top edge away, which is
        // the way a card tips under a finger.
        el.style.setProperty('--ry', `${(x * MAX_DEG * 2).toFixed(2)}deg`)
        el.style.setProperty('--rx', `${(-y * MAX_DEG * 2).toFixed(2)}deg`)
        el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`)
        el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`)
        el.classList.add(`${block}--tilt`)
      })
    },
    [block],
  )

  const onPointerLeave = useCallback(() => {
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = 0
    }
    box.current = null
    const el = node.current
    if (!el) return
    el.classList.remove(`${block}--tilt`)
    // The properties go too, so the card is back to exactly what the stylesheet says.
    for (const name of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(name)
  }, [block])

  return { ref, onPointerEnter, onPointerMove, onPointerLeave }
}
