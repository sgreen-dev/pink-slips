import { useEffect, useState } from 'react'
import { effectsSnapshot } from './sfx.ts'
import type { MusicPlayer, MusicSnapshot } from './music.ts'

/** A small readout of the music player's state, shown only with `?sound=debug` in the address. */
export function SoundDebug({ player }: { player: MusicPlayer }) {
  const [snap, setSnap] = useState<MusicSnapshot | null>(null)
  useEffect(() => {
    const timer = setInterval(() => setSnap(player.snapshot()), 250)
    return () => clearInterval(timer)
  }, [player])
  if (!snap) return null
  const latency = snap.latencyMs === null ? 'no tap yet' : `${Math.round(snap.latencyMs)} ms`
  return (
    <pre className="sound__debug" aria-live="off">
      {`effects ${effectsSnapshot().decoded} of ${effectsSnapshot().files} files decoded\n`}
      {`engine ${snap.engine} · unlocked ${snap.unlocked} · music ${snap.enabled}\n` +
        `track ${snap.track ?? 'none'} · ready ${snap.readyState} · buffered ${snap.buffered.toFixed(1)}s\n` +
        `${snap.playing ? 'playing' : 'silent'} · tap to sound ${latency}`}
    </pre>
  )
}
