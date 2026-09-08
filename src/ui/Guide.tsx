import { useEffect, useRef, useState } from 'react'
import { guideSteps, type GuideStepId } from './guide.ts'

interface GuideProps {
  /** The step the board is at, or null when the guide has nothing to say. */
  step: GuideStepId | null
  onSkip: () => void
}

/**
 * The guided first match's callout (DESIGN.md 8): one step at a time under the prompt, pointing
 * up at the garage or down at the buttons and hand. A step shows once: OK hides it, and a step
 * the board has moved past does not come back. The finish step is a line in the race-end banner.
 */
export function Guide({ step, onSkip }: GuideProps) {
  const [seen, setSeen] = useState<readonly GuideStepId[]>([])
  // The step of the previous render, kept in state so a change is noticed during render.
  const [last, setLast] = useState(step)
  if (step !== last) {
    setLast(step)
    // The board moved on by itself, so the old step counts as seen.
    if (last !== null && !seen.includes(last)) setSeen([...seen, last])
  }
  const shown = step !== null && step !== 'finish' && !seen.includes(step) ? step : null
  const box = useRef<HTMLElement | null>(null)
  // A new step brings itself into view, which matters on a phone, where the board scrolls.
  useEffect(() => {
    const el = box.current
    if (shown === null || !el || typeof el.scrollIntoView !== 'function') return
    const reduced =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [shown])
  if (shown === null) return null
  const { text, toward } = guideSteps()[shown]
  return (
    <aside ref={box} className={`guide guide--${toward}`} role="status">
      <p className="guide__text">{text}</p>
      <div className="guide__actions">
        <button
          type="button"
          className="button button--ghost button--small"
          onClick={() => setSeen([...seen, shown])}
        >
          OK
        </button>
        <button type="button" className="button button--ghost button--small" onClick={onSkip}>
          Skip guide
        </button>
      </div>
    </aside>
  )
}
