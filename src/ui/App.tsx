import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { loadCollection } from '../collection/persist.ts'
import type { Level } from '../cpu/index.ts'
import type { MatchConfig } from '../engine/index.ts'
import type { AccountData } from '../server/directory.ts'
import {
  AccountContext,
  claimGuest,
  leaveAccount,
  fetchMe,
  loadSession,
  mirror,
  saveSession,
  signOutOnline,
  type AccountHandle,
} from './account.ts'
import type { Mode } from './Match.tsx'
import { roomEndpoint, roomFromSearch } from './roomLink.ts'
import type { OnlineEntry } from './OnlineScreen.tsx'
import { DetailProvider } from './CardDetail.tsx'
import type { PlayerView } from './PlayerDialog.tsx'
import { scrollPageTop } from './scroll.ts'
import { newSeed } from './seed.ts'
import { count, flush } from './analytics.ts'
import { useSound } from './sound/useSound.ts'
import { StartScreen } from './StartScreen.tsx'
import { loadGarages } from '../browser/storage.ts'

/**
 * Every screen but the start one is loaded when it is opened. The start screen is the first
 * paint, so it and what it draws stay eager; a first visit no longer downloads the board, the
 * CPU, the builder, the collection, the online screens and the profile before it can show the
 * title. Each `lazy` call is its own chunk, fetched on the navigation that needs it.
 */
const BuilderScreen = lazy(() =>
  import('./BuilderScreen.tsx').then((m) => ({ default: m.BuilderScreen })),
)
const CollectionScreen = lazy(() =>
  import('./CollectionScreen.tsx').then((m) => ({ default: m.CollectionScreen })),
)
const Match = lazy(() => import('./Match.tsx').then((m) => ({ default: m.Match })))
const OnlineMatch = lazy(() =>
  import('./OnlineMatch.tsx').then((m) => ({ default: m.OnlineMatch })),
)
const OnlineScreen = lazy(() =>
  import('./OnlineScreen.tsx').then((m) => ({ default: m.OnlineScreen })),
)
const PlayerDialog = lazy(() =>
  import('./PlayerDialog.tsx').then((m) => ({ default: m.PlayerDialog })),
)
const ProfileScreen = lazy(() =>
  import('./ProfileScreen.tsx').then((m) => ({ default: m.ProfileScreen })),
)

/** Held for the moment a screen's chunk takes to arrive. Its own name, so it is never blank. */
function Loading() {
  return (
    <main className="start">
      <p className="board__brand">Pink Slips</p>
    </main>
  )
}

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
  const [sessionKept, setSessionKept] = useState(true)
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
        leaveAccount()
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
    leaveAccount()
    setToken(null)
    setData(null)
    setGeneration((n) => n + 1)
    setScreen({ kind: 'start' })
  }, [token])

  /** A player was made or recovered in the pop-up: from now on this browser holds it. */
  const signedIn = useCallback((fresh: string) => {
    // A browser that refuses the token leaves the player signed in on this page and a guest on
    // the next visit, so the code view is told and says so while the code is still on screen.
    setSessionKept(saveSession(fresh))
    setData(null)
    setToken(fresh)
  }, [])

  const account: AccountHandle | null =
    ENDPOINT && token && data
      ? { endpoint: ENDPOINT, token, data, update, replaceToken: signedIn, signOut }
      : null
  // A screen opens at its top. The button that reaches one sits below the main action, at the
  // bottom of the screen you were on, so on a phone the builder and the collection would
  // otherwise open half-way down with their headers off screen (DESIGN.md 8).
  useEffect(() => {
    scrollPageTop()
  }, [screen.kind])

  // What the game counts (backlog Q40): the screens opened, once each time one opens. The visit
  // and the screen size go once, on the way in.
  useEffect(() => {
    count('visit')
    count(window.matchMedia('(max-width: 720px)').matches ? 'screen-phone' : 'screen-desktop')
    return () => flush()
  }, [])
  useEffect(() => {
    if (screen.kind === 'builder') count('builder-opened')
    if (screen.kind === 'collection') count('collection-opened')
  }, [screen.kind])

  const toStart = () => setScreen({ kind: 'start' })
  const toOnline = () => setScreen({ kind: 'online', prefill: null })
  const openPlayer = (view: PlayerView, code: string | null = null) => setDialog({ view, code })

  let page: ReactNode
  if (screen.kind === 'start') {
    page = (
      <StartScreen
        key={generation}
        onStart={(mode, config, names, level) => {
          count(mode === 'cpu' ? 'match-start-cpu' : 'match-start-hotseat')
          setScreen({ kind: 'match', mode, config, names, level, seed: newSeed() })
        }}
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
      <DetailProvider>
        <Soundtrack kind={screen.kind} />
        {/* The page goes inert under the player dialog, as the match and result screens do under
            theirs, so Tab cannot walk out of a modal into the page it covers (backlog A9). The
            wrapper is display: contents, so it takes no part in the layout. */}
        <div className="app__page" inert={Boolean(dialog && ENDPOINT)}>
          <Suspense fallback={<Loading />}>{page}</Suspense>
        </div>
      </DetailProvider>
      {dialog && ENDPOINT && (
        <Suspense fallback={null}>
          <PlayerDialog
            sessionKept={sessionKept}
            endpoint={ENDPOINT}
            view={dialog.view}
            code={dialog.code}
            onSignedIn={signedIn}
            onClose={() => setDialog(null)}
          />
        </Suspense>
      )}
    </AccountContext>
  )
}
