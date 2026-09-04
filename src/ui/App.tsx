import { useState } from 'react'
import type { Level } from '../cpu/index.ts'
import type { MatchConfig } from '../engine/index.ts'
import { BuilderScreen } from './BuilderScreen.tsx'
import { CollectionScreen } from './CollectionScreen.tsx'
import { Match, type Mode } from './Match.tsx'
import { roomEndpoint, roomFromSearch } from './online.ts'
import { OnlineMatch } from './OnlineMatch.tsx'
import { OnlineScreen, type OnlineEntry } from './OnlineScreen.tsx'
import { newSeed } from './seed.ts'
import { StartScreen } from './StartScreen.tsx'

type Screen =
  | { kind: 'start' }
  | { kind: 'builder' }
  | { kind: 'collection' }
  | {
      kind: 'match'
      mode: Mode
      config: MatchConfig
      names: [string, string]
      level: Level
      seed: number
    }
  | { kind: 'online'; prefill: string | null }
  | { kind: 'onlineMatch'; entry: OnlineEntry; key: number }

/** The room service, when the build has one; without it the app is offline-only. */
const ENDPOINT = roomEndpoint()

/** A shared room link opens straight onto the online screen with the code filled in. */
function firstScreen(): Screen {
  const code = ENDPOINT ? roomFromSearch(window.location.search) : null
  return code ? { kind: 'online', prefill: code } : { kind: 'start' }
}

export function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen)
  const toStart = () => setScreen({ kind: 'start' })
  const toOnline = () => setScreen({ kind: 'online', prefill: null })
  if (screen.kind === 'start') {
    return (
      <StartScreen
        onStart={(mode, config, names, level) =>
          setScreen({ kind: 'match', mode, config, names, level, seed: newSeed() })
        }
        onBuilder={() => setScreen({ kind: 'builder' })}
        onCollection={() => setScreen({ kind: 'collection' })}
        onOnline={ENDPOINT ? toOnline : undefined}
      />
    )
  }
  if (screen.kind === 'builder') return <BuilderScreen onBack={toStart} />
  if (screen.kind === 'collection') return <CollectionScreen onBack={toStart} />
  if (screen.kind === 'online') {
    if (!ENDPOINT) return null
    return (
      <OnlineScreen
        endpoint={ENDPOINT}
        prefillCode={screen.prefill}
        onPlay={(entry) => setScreen({ kind: 'onlineMatch', entry, key: newSeed() })}
        onBack={toStart}
      />
    )
  }
  if (screen.kind === 'onlineMatch') {
    if (!ENDPOINT) return null
    return (
      <OnlineMatch
        key={screen.key}
        endpoint={ENDPOINT}
        entry={screen.entry}
        onLeave={toStart}
        onAgain={toOnline}
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
      level={screen.level}
      onRematch={() => setScreen({ ...screen, seed: newSeed() })}
      onNewMatch={toStart}
    />
  )
}
