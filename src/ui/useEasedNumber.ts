import { useEffect, useRef, useState } from 'react'

/**
 * A number that walks to its new value instead of snapping to it.
 *
 * The lane marker already slides down the track over 600ms, but the distance beside it is text,
 * so it changed on the frame the state did. For the whole of that slide the readout disagreed
 * with where the car visibly was, which is the one thing a readout must not do. This walks the
 * displayed value along the same curve over the same time, so the two land together.
 *
 * A number cannot be transitioned in CSS, hence the frame loop. `prefers-reduced-motion` skips
 * it entirely rather than shortening it: someone who has asked for no motion wants the value,
 * not a faster animation of it.
 */

/** How long `.lane__marker` takes to slide. The two are meant to agree, so they share a number. */
export const SLIDE_MS = 600

/**
 * easeOutCubic, which `.lane__marker` transitions on as `cubic-bezier(0.33, 1, 0.68, 1)`.
 *
 * That bezier approximates this curve rather than being it — it is parametric in its own space,
 * not in time — so the two are close rather than equal. Measured on a 1200px road by seeking the
 * transition's own timeline, the marker sits at 0 / 693 / 1047 / 1180 / 1200 across the slide
 * where this function gives 0 / 694 / 1050 / 1181 / 1200: three pixels apart at worst, a
 * quarter of one percent. Near enough that nothing could see the difference.
 */
export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * `target`, reached over `ms`. Changing target mid-flight retargets from wherever the value has
 * got to rather than restarting, so a second advance arriving early does not jerk backwards.
 */
export function useEasedNumber(target: number, ms: number = SLIDE_MS): number {
  const [shown, setShown] = useState(target)
  // What is on screen right now, read at the start of the next flight. State would be a frame
  // behind by then, and the frame it is behind by is the one that sets the starting point.
  const current = useRef(target)
  const frame = useRef(0)
  // Read during render, not in the effect: when there is to be no animation the target is
  // returned directly, so there is no state to set and no render spent setting it.
  const still = ms <= 0 || prefersReducedMotion()

  useEffect(() => {
    if (still) {
      current.current = target
      return
    }
    const from = current.current
    if (from === target) return

    const started = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - started) / ms)
      const value = t === 1 ? target : from + (target - from) * easeOutCubic(t)
      current.current = value
      setShown(value)
      if (t < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
  }, [target, ms, still])

  return still ? target : shown
}
