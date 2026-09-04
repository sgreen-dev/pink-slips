import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { loadCollection } from '../collection/persist.ts'
import type { Level } from '../cpu/index.ts'
import type { MatchConfig } from '../engine/index.ts'
import type { AccountData } from '../server/directory.ts'
import {
  AccountContext,
  claimGuest,
  clearSession,
  fetchMe,
  loadSession,
  mirror,
  saveSession,
  signOutOnline,
  type AccountHandle,
} from './account.ts'
import { BuilderScreen } from './BuilderScreen.tsx'
import { CollectionScreen } from './CollectionScreen.tsx'
import { Match, type Mode } from './Match.tsx'
import { roomEndpoint, roomFromSearch } from './online.ts'
import { OnlineMatch } from './OnlineMatch.tsx'
import { OnlineScreen, type OnlineEntry } from './OnlineScreen.tsx'
import { PlayerDialog, type PlayerView } from './PlayerDialog.tsx'
import { ProfileScreen } from './ProfileScreen.tsx'
import { newSeed } from './seed.ts'
import { useSound } from './sound/useSound.ts'
import { StartScreen } from './StartScreen.tsx'
import { loadGarages } from './storage.ts'

type Screen =
  | { kind: 'start' }
  | { kind: 'builder' }
  | { kind: 'collection' }
  | { kind: 'profile' }
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

/** Tells the music which scene is on screen: a match plays lower and opens on a new track. */
function Soundtrack({ kind }: { kind: string }) {
  const { setScene } = useSound()
  useEffect(() => {
    setScene(kind === 'match' || kind === 'onlineMatch' ? 'race' : 'menu')
  }, [kind, setScene])
  return null
}

export function App() {
  const [screen, setScreen] = useState<Screen>(firstScreen)
  const [token, setToken] = useState<string | null>(loadSession)
  const [data, setData] = useState<AccountData | null>(null)
  // Bumped when a player signs in or out so screens re-read the mirrored storage.
  const [generation, setGeneration] = useState(0)
  // The player pop-up: making a player, recovering one, or reading a recovery code.
  const [dialog, setDialog] = useState<{ view: PlayerView; code: string | null } | null>(null)

  // With a token, fetch the account; claim the guest data the first time; mirror it locally.
  useEffect(() => {
    if (!ENDPOINT || !token) return
    let live = true
    const endpoint = ENDPOINT
    void (async () => {
      const me = await fetchMe(endpoint, token)
      if (!live) return
      if (me.signedOut) {
        clearSession()
        setToken(null)
        return
      }
      let account = me.data
      if (account && !account.profile.claimed) {
        const claimed = await claimGuest(endpoint, token, {
          collection: loadCollection(),
          garages: loadGarages(),
        })
        if (!live) return
        account = claimed ?? account
      }
      if (!account) return
      mirror(account)
      setData(account)
      setGeneration((n) => n + 1)
    })()
    return () => {
      live = false
    }
  }, [token])

  // Screens that already hold the new data keep their state; only sign-in and sign-out remount.
  const update = useCallback((next: AccountData) => {
    mirror(next)
    setData(next)
  }, [])

  const signOut = useCallback(() => {
    if (ENDPOINT && token) void signOutOnline(ENDPOINT, token)
    clearSession()
    setToken(null)
    setData(null)
    setGeneration((n) => n + 1)
    setScreen({ kind: 'start' })
  }, [token])

  /** A player was made or recovered in the pop-up: from now on this browser holds it. */
  const signedIn = useCallback((fresh: string) => {
    saveSession(fresh)
    setData(null)
    setToken(fresh)
  }, [])

  const account: AccountHandle | null =
    ENDPOINT && token && data ? { endpoint: ENDPOINT, token, data, update, signOut } : null
  const toStart = () => setScreen({ kind: 'start' })
  const toOnline = () => setScreen({ kind: 'online', prefill: null })
  const openPlayer = (view: PlayerView, code: string | null = null) => setDialog({ view, code })

  let page: ReactNode
  if (screen.kind === 'start') {
    page = (
      <StartScreen
        key={generation}
        onStart={(mode, config, names, level) =>
          setScreen({ kind: 'match', mode, config, names, level, seed: newSeed() })
        }
        onBuilder={() => setScreen({ kind: 'builder' })}
        onCollection={() => setScreen({ kind: 'collection' })}
        onOnline={ENDPOINT ? toOnline : undefined}
        onProfile={() => setScreen({ kind: 'profile' })}
        onPlayer={ENDPOINT ? openPlayer : undefined}
      />
    )
  } else if (screen.kind === 'builder') {
    page = <BuilderScreen key={generation} onBack={toStart} />
  } else if (screen.kind === 'collection') {
    page = <CollectionScreen key={generation} onBack={toStart} />
  } else if (screen.kind === 'profile') {
    page = <ProfileScreen onBack={toStart} onShowCode={(code) => openPlayer('code', code)} />
  } else if (screen.kind === 'online') {
    page = ENDPOINT ? (
      <OnlineScreen
        endpoint={ENDPOINT}
        prefillCode={screen.prefill}
        onPlay={(entry) => setScreen({ kind: 'onlineMatch', entry, key: newSeed() })}
        onBack={toStart}
      />
    ) : null
  } else if (screen.kind === 'onlineMatch') {
    page = ENDPOINT ? (
      <OnlineMatch
        key={screen.key}
        endpoint={ENDPOINT}
        entry={screen.entry}
        onLeave={toStart}
        onAgain={toOnline}
      />
    ) : null
  } else {
    page = (
      <Match
        key={screen.seed}
        mode={screen.mode}
        config={screen.config}
        seed={screen.seed}
        names={screen.names}
        level={screen.level}
        onRematch={() => setScreen({ ...screen, seed: newSeed() })}
        onNewMatch={toStart}
        onExit={toStart}
      />
    )
  }
  return (
    <AccountContext value={account}>
      <Soundtrack kind={screen.kind} />
      {page}
      {dialog && ENDPOINT && (
        <PlayerDialog
          endpoint={ENDPOINT}
          view={dialog.view}
          code={dialog.code}
          onSignedIn={signedIn}
          onClose={() => setDialog(null)}
        />
      )}
    </AccountContext>
  )
}
