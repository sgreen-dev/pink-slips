import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { packsEarned } from '../collection/collection.ts'
import { addPacks, loadCollection } from '../collection/persist.ts'
import { currentPlayer, isOver, type Action, type PlayerIndex } from '../engine/index.ts'
import { AccountContext, fetchMe } from './account.ts'
import { Board } from './Board.tsx'
import { isModPlay } from './celebration.ts'
import { recordMatch } from './counter.ts'
import { NO_SELECTION, type Selection } from './interaction.ts'
import {
  clearOnlineSeat,
  reduceOnline,
  RoomClient,
  roomLink,
  saveOnlineSeat,
  socketUrl,
  startOnline,
} from './online.ts'
import type { OnlineEntry } from './OnlineScreen.tsx'
import { RaceEndBanner } from './RaceEndBanner.tsx'
import { ResultScreen } from './ResultScreen.tsx'
import { beforeStart, soundsBetween } from './sound/events.ts'
import { useSound } from './sound/useSound.ts'
import { VariantContext, lookupFrom } from './variants.ts'

interface OnlineMatchProps {
  endpoint: string
  entry: OnlineEntry
  onLeave: () => void
  /** Back to the online screen to make another room. */
  onAgain: () => void
}

/** How long to wait for the room's result message after the final state before going local. */
const RESULT_GRACE_MS = 3000

/**
 * One online match as one seat sees it. The room holds the match; this screen sends actions
 * and draws whatever view comes back, holding the race-end moment the same way the local
 * match does. When the match ends, the room's result message says what the account earned.
 */
export function OnlineMatch({ endpoint, entry, onLeave, onAgain }: OnlineMatchProps) {
  const account = useContext(AccountContext)
  const [session, dispatch] = useReducer(reduceOnline, entry, (e) => startOnline(e.code, e.name))
  const client = useRef<RoomClient | null>(null)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [options, setOptions] = useState<Action[] | null>(null)
  const [variantOf] = useState(() => lookupFrom(loadCollection().variants))
  const recorded = useRef(false)
  const [earned, setEarned] = useState(0)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Mod plays sent this step and not yet taken back; the room is the judge, this only shows the button.
  const [undoable, setUndoable] = useState(0)
  const onContinue = useCallback(() => dispatch({ type: 'continue' }), [])
  const accountToken = account?.token ?? null

  useEffect(() => {
    const room = new RoomClient(socketUrl(endpoint, entry.code, accountToken), {
      onMessage: (message) => dispatch({ type: 'message', message }),
      onStatus: (status) => dispatch({ type: 'status', status }),
    })
    client.current = room
    if (entry.token) room.resume(entry.token)
    else if (entry.garage) room.join(entry.name, entry.garage, entry.ticket ?? undefined)
    room.connect()
    return () => {
      client.current = null
      room.close()
    }
  }, [endpoint, entry, accountToken])

  // The seat is kept for a refresh or a dropped connection until the match ends.
  const { code, seat, token, view } = session
  const sound = useSound()
  const heard = useRef<typeof view>(null)
  useEffect(() => {
    if (view === null) return
    const events = soundsBetween(heard.current ?? beforeStart(view), view, seat)
    heard.current = view
    for (const event of events) sound.play(event.name, event.intensity)
  }, [view, seat, sound])
  useEffect(() => {
    if (token !== null && seat !== null) saveOnlineSeat({ code, token, seat, name: entry.name })
  }, [code, token, seat, entry.name])

  // At the end, the room says what the account earned; a guest keeps the local rule.
  const winner = view === null ? null : isOver(view)
  const result = session.result
  useEffect(() => {
    if (winner === null || seat === null || recorded.current) return
    const settle = (packs: number | null, rating: { before: number; after: number } | null) => {
      recorded.current = true
      clearOnlineSeat()
      // One count per match: the first seat reports it.
      if (seat === 0) void recordMatch()
      if (packs === null || !account) {
        const local = packs ?? packsEarned('online', winner === seat)
        addPacks(local)
        setEarned(local)
      } else {
        // Refresh the account first so the pack pop-up opens from the right count.
        void fetchMe(account.endpoint, account.token).then((me) => {
          if (me.data) account.update(me.data)
          else addPacks(packs)
          setEarned(packs)
        })
      }
      setNote(rating ? `Rating ${rating.before} → ${rating.after}` : null)
    }
    if (result) {
      settle(result.packsEarned, result.rating)
      return
    }
    const timer = setTimeout(() => settle(null, null), RESULT_GRACE_MS)
    return () => clearTimeout(timer)
  }, [winner, seat, result, account])

  const opponent: PlayerIndex = seat === 0 ? 1 : 0
  const opponentName = session.names[opponent]
  const headline = (player: PlayerIndex) =>
    player === seat ? 'You win' : `${session.names[player]} wins`

  if (seat === null && session.error !== null) {
    return (
      <main className="start online">
        <h1 className="online__title">Could not join room {session.code}</h1>
        <p className="online__error" role="alert">
          {session.error}
        </p>
        <div className="online__actions">
          <button type="button" className="button button--primary" onClick={onAgain}>
            Back to online play
          </button>
        </div>
      </main>
    )
  }

  if (view === null || seat === null) {
    const link = roomLink(session.code, window.location)
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(link)
        setCopied(true)
      } catch {
        setCopied(false)
      }
    }
    const status =
      session.status !== 'open'
        ? 'Connecting to the room…'
        : seat === null
          ? 'Taking a seat…'
          : 'Waiting for your opponent to join…'
    const ranked = entry.ticket !== null
    return (
      <main className="start online">
        <h1 className="online__title">{ranked ? 'Ranked match' : 'Room'}</h1>
        <p className="online__code" aria-label={`Room code ${session.code}`}>
          {session.code}
        </p>
        {ranked ? (
          <p>Your opponent is on the way. The match starts as soon as you are both seated.</p>
        ) : (
          <>
            <p>Send this link to your opponent. The match starts as soon as they join.</p>
            <p className="online__link">
              <code>{link}</code>
            </p>
          </>
        )}
        <div className="online__actions">
          {!ranked && (
            <button type="button" className="button button--primary" onClick={() => void copy()}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          )}
          <button type="button" className="button" onClick={onLeave}>
            Leave
          </button>
        </div>
        <p className="online__status" role="status">
          {status}
        </p>
      </main>
    )
  }

  if (winner !== null && session.raceEnd === null) {
    return (
      <VariantContext value={variantOf}>
        <ResultScreen
          state={view}
          winner={winner}
          names={session.names}
          title={headline(winner)}
          note={note}
          packsEarned={earned}
          rematchLabel={entry.ticket ? 'Play again' : 'New room'}
          onRematch={onAgain}
          onNewMatch={onLeave}
        />
      </VariantContext>
    )
  }

  const onAction = (action: Action) => {
    client.current?.act(action)
    setSelection(NO_SELECTION)
    setOptions(null)
    const open = view.phase.kind === 'turn' && view.turn.step === 'mods'
    setUndoable(isModPlay(action) && open ? undoable + 1 : 0)
  }
  const onUndo = () => {
    client.current?.undo()
    setSelection(NO_SELECTION)
    setOptions(null)
    setUndoable((n) => Math.max(0, n - 1))
    sound.play('shuffle')
  }
  const yourTurn = currentPlayer(view) === seat
  const canUndo =
    undoable > 0 && yourTurn && view.phase.kind === 'turn' && view.turn.step === 'mods'
  const warn = session.status !== 'open' || !session.opponentConnected || session.error !== null
  const line =
    session.status !== 'open'
      ? 'Connection lost. Reconnecting…'
      : !session.opponentConnected
        ? `${opponentName} has dropped out. Waiting for them to come back…`
        : (session.error ?? (yourTurn ? 'Your turn' : `${opponentName} is playing…`))

  return (
    <VariantContext value={variantOf}>
      <div className="online__bar">
        <span>
          {entry.ticket ? 'Ranked · ' : ''}Room {session.code}
        </span>
        <span className={warn ? 'online__bar--warn' : ''} role="status">
          {line}
        </span>
        <button type="button" className="button button--small" onClick={onLeave}>
          Leave
        </button>
      </div>
      <Board
        state={view}
        viewer={seat}
        names={session.names}
        selection={selection}
        options={options}
        onAction={onAction}
        onSelect={setSelection}
        onOptions={setOptions}
        frozen={session.raceEnd}
        inert={session.raceEnd !== null || session.status !== 'open'}
        plainOpponent
        canUndo={canUndo}
        onUndo={onUndo}
      />
      {session.raceEnd !== null && (
        <RaceEndBanner
          raceEnd={session.raceEnd}
          headline={headline(session.raceEnd.winner)}
          onContinue={onContinue}
        />
      )}
    </VariantContext>
  )
}
