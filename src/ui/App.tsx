import { useState } from 'react'
import type { MatchConfig } from '../engine/index.ts'
import { Match, type Mode } from './Match.tsx'
import { StartScreen } from './StartScreen.tsx'

type Screen =
  | { kind: 'start' }
  | { kind: 'match'; mode: Mode; config: MatchConfig; names: [string, string]; seed: number }

function newSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })
  if (screen.kind === 'start') {
    return (
      <StartScreen
        onStart={(mode, config, names) =>
          setScreen({ kind: 'match', mode, config, names, seed: newSeed() })
        }
      />
    )
  }
  return (
    <Match
      key={screen.seed}
      mode={screen.mode}
      config={screen.config}
      seed={screen.seed}
      names={screen.names}
      onRematch={() => setScreen({ ...screen, seed: newSeed() })}
      onNewMatch={() => setScreen({ kind: 'start' })}
    />
  )
}
