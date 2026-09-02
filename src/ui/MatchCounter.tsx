import { useEffect, useState } from 'react'
import { readMatchCount } from './counter.ts'

/** The quiet line at the bottom of the start screen. Renders nothing when there is no count. */
export function MatchCounter() {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let live = true
    void readMatchCount().then((value) => {
      if (live) setCount(value)
    })
    return () => {
      live = false
    }
  }, [])
  if (count === null) return null
  return <p className="counter">{count.toLocaleString()} matches raced</p>
}
