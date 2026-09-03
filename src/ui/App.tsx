import { useState } from 'react'
import type { MatchConfig } from '../engine/index.ts'
import { BuilderScreen } from './BuilderScreen.tsx'
import { CollectionScreen } from './CollectionScreen.tsx'
import { Match, type Mode } from './Match.tsx'
import { newSeed } from './seed.ts'
import { StartScreen } from './StartScreen.tsx'

type Screen =
  | { kind: 'start' }
  | { kind: 'builder' }
  | { kind: 'collection' }
  | { kind: 'match'; mode: Mode; config: MatchConfig; names: [string, string]; seed: number }

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'start' })
  const toStart = () => setScreen({ kind: 'start' })
  if (screen.kind === 'start') {
    return (
      <StartScreen
        onStart={(mode, config, names) =>
          setScreen({ kind: 'match', mode, config, names, seed: newSeed() })
        }
        onBuilder={() => setScreen({ kind: 'builder' })}
        onCollection={() => setScreen({ kind: 'collection' })}
      />
    )
  }
  if (screen.kind === 'builder') return <BuilderScreen onBack={toStart} />
  if (screen.kind === 'collection') return <CollectionScreen onBack={toStart} />
  return (
    <Match
      key={screen.seed}
      mode={screen.mode}
      config={screen.config}
      seed={screen.seed}
      names={screen.names}
      onRematch={() => setScreen({ ...screen, seed: newSeed() })}
      onNewMatch={toStart}
    />
  )
}
