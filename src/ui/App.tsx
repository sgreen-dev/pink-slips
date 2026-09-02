import { useState } from 'react'
import type { MatchConfig } from '../engine/index.ts'
import { Match } from './Match.tsx'
import { StartScreen } from './StartScreen.tsx'

type Screen =
  { kind: 'start' } | { kind: 'match'; config: MatchConfig; names: [string, string]; seed: number }

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })
  if (screen.kind === 'start') {
    return (
      <StartScreen
        onStart={(config, names) => setScreen({ kind: 'match', config, names, seed: newSeed() })}
      />
    )
  }
  return (
    <Match
      key={screen.seed}
      config={screen.config}
      seed={screen.seed}
      names={screen.names}
      onRematch={() => setScreen({ ...screen, seed: newSeed() })}
      onNewMatch={() => setScreen({ kind: 'start' })}
    />
  )
}
