import { useState } from 'react'
import { Callout } from './Callout.tsx'
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
  if (shown === null) return null
  const { text, toward } = guideSteps()[shown]
  return (
    <Callout toward={toward === 'none' ? 'down' : toward} text={text}>
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
    </Callout>
  )
}
