import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { packsEarned } from '../collection/collection.ts'
import { addPacks, loadCollection } from '../collection/persist.ts'
import { currentPlayer, isModPlay, isOver, type Action, type PlayerIndex } from '../engine/index.ts'
import { EMPTY_TRANSFER, type Transfer } from '../collection/stakes.ts'
import { AccountContext, fetchMe } from './account.ts'
import { copyText } from './clipboard.ts'
import { Board } from './Board.tsx'
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
  secondsLeft,
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

/** How often the turn clock redraws, and when it starts warning. Screen timings, not rules. */
const CLOCK_TICK_MS = 1000
const CLOCK_URGENT_S = 15

/**
 * One online match as one seat sees it. The room holds the match; this screen sends actions
 * and draws whatever view comes back, holding the race-end moment the same way the local
 * match does. When the match ends, the room's result message says what the account earned.
 */
/**
 * What the turn clock says to a screen reader. Urgency is a colour on screen, which is no
 * signal at all to anyone who cannot see it, and running out forfeits a rated match.
 */
function clockLabel(left: number, yours: boolean): string {
  const whose = yours ? 'your turn' : "your opponent's turn"
  if (left <= CLOCK_URGENT_S) return `${left} seconds left on ${whose}`
  const minutes = Math.floor(left / 60)
  const seconds = left % 60
  const time = minutes > 0 ? `${minutes} minutes ${seconds} seconds` : `${seconds} seconds`
  return `${time} left on ${whose}`
}

export function OnlineMatch({ endpoint, entry, onLeave, onAgain }: OnlineMatchProps) {
  const account = useContext(AccountContext)
  const [session, dispatch] = useReducer(reduceOnline, entry, (e) => startOnline(e.code, e.name))
  const client = useRef<RoomClient | null>(null)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [options, setOptions] = useState<Action[] | null>(null)
  const [variantOf] = useState(() => lookupFrom(loadCollection().variants))
  const [recorded, setRecorded] = useState(false)
  const [earned, setEarned] = useState(0)
  const [unstored, setUnstored] = useState(false)
  const [seatUnstored, setSeatUnstored] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [settled, setSettled] = useState<Transfer | null>(null)
  const [copied, setCopied] = useState(false)
  // Leave during a started match concedes, behind a confirm.
  const [conceding, setConceding] = useState(false)
  // Mod plays sent this step and not yet taken back; the room is the judge, this only shows the button.
  const [undoable, setUndoable] = useState(0)
  // The turn clock (DESIGN.md 13): the room sends what is left, the screen anchors it to its own
  // clock and redraws each second, recomputing from the anchor so a throttled tab is not stale.
  const [clockNow, setClockNow] = useState(0)
  const onContinue = useCallback(() => dispatch({ type: 'continue' }), [])
  const accountToken = account?.token ?? null

  // Redraw once a second while something is counting, and stop when nothing is. The end itself
  // was anchored to this screen's clock when the frame arrived, so only "now" moves here.
  const clockEndsAt = session.turnEndsAt
  useEffect(() => {
    if (clockEndsAt === null) return
    const tick = () => setClockNow(Date.now())
    // A first tick on the next turn of the loop, so a clock that has just started is not drawn
    // a second stale, then once a second after that.
    const first = setTimeout(tick, 0)
    const timer = setInterval(tick, CLOCK_TICK_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [clockEndsAt])

  useEffect(() => {
    const room = new RoomClient(socketUrl(endpoint, entry.code, accountToken), {
      onMessage: (message) => dispatch({ type: 'message', message, at: Date.now() }),
      onStatus: (status) => dispatch({ type: 'status', status }),
    })
    client.current = room
    if (entry.token) room.resume(entry.token)
    else if (entry.garage)
      room.join(entry.name, entry.garage, entry.ticket ?? undefined, entry.stakes)
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
    if (token === null || seat === null) return
    // The seat is what a refresh rejoins with, so a refused write costs the match rather than a
    // convenience. Set from a callback, as the other write notices are.
    const saved = saveOnlineSeat({ code, token, seat, name: entry.name })
    void Promise.resolve(saved).then((ok) => {
      if (!ok) setSeatUnstored(true)
    })
  }, [code, token, seat, entry.name])

  // At the end, the room says what the account earned; a guest keeps the local rule.
  const winner = view === null ? null : isOver(view)
  const result = session.result
  // A rematch: the finished match's bookkeeping starts over, noticed during render.
  const [wasOver, setWasOver] = useState(winner !== null)
  if ((winner !== null) !== wasOver) {
    setWasOver(winner !== null)
    if (winner === null) {
      setRecorded(false)
      setEarned(0)
      setNote(null)
      setSettled(null)
    }
  }
  useEffect(() => {
    if (winner === null || seat === null || recorded) return
    const settle = (
      packs: number | null,
      rating: { before: number; after: number } | null,
      stakes: Transfer | null = null,
    ) => {
      setRecorded(true)
      setSettled(stakes)
      // One count per match: the first seat reports it.
      if (seat === 0) void recordMatch()
      if (packs === null || !account) {
        const local = packs ?? packsEarned('online', winner === seat)
        if (!addPacks(local).saved) setUnstored(true)
        setEarned(local)
      } else {
        // Refresh the account first so the pack pop-up opens from the right count.
        void fetchMe(account.endpoint, account.token).then((me) => {
          if (me.data) account.update(me.data)
          else if (!addPacks(packs).saved) setUnstored(true)
          setEarned(packs)
        })
      }
      setNote(rating ? `Rating ${rating.before} → ${rating.after}` : null)
    }
    if (result) {
      settle(result.packsEarned, result.rating, result.stakes)
      return
    }
    const timer = setTimeout(() => settle(null, null), RESULT_GRACE_MS)
    return () => clearTimeout(timer)
  }, [winner, seat, result, account, recorded])

  const opponent: PlayerIndex = seat === 0 ? 1 : 0
  const opponentName = session.names[opponent]
  // The saved seat outlives the result so a refresh during a rematch offer rejoins; leaving clears it.
  const leaveRoom = () => {
    clearOnlineSeat()
    onLeave()
  }
  const anotherRoom = () => {
    clearOnlineSeat()
    onAgain()
  }
  const headline = (player: PlayerIndex) => {
    if (player === seat) return 'You win'
    const laps = session.plates[player]
    return `${session.names[player]}${laps > 0 ? ` (Lap ${laps})` : ''} wins`
  }

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
      setCopied(await copyText(link))
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
          storageWarning={
            unstored
              ? 'This browser is blocking storage, so the packs this match earned will be gone next time you open the game.'
              : null
          }
          stakes={entry.stakes ? (settled ?? EMPTY_TRANSFER) : null}
          rematchLabel={
            entry.ticket
              ? 'Play again'
              : !entry.stakes
                ? seat !== null && session.rematch[seat]
                  ? `Waiting for ${opponentName}`
                  : 'Play again'
                : 'New room'
          }
          rematchDisabled={!entry.ticket && !entry.stakes && seat !== null && session.rematch[seat]}
          rematchNote={
            !entry.ticket &&
            !entry.stakes &&
            session.rematch[opponent] &&
            !(seat !== null && session.rematch[seat])
              ? `${opponentName} wants to play again.`
              : null
          }
          onRematch={!entry.ticket && !entry.stakes ? () => client.current?.rematch() : anotherRoom}
          onNewMatch={leaveRoom}
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
  // Nothing is drawn until the first tick gives a real now, so the clock never shows a stale one.
  const left = clockNow === 0 ? null : secondsLeft(clockEndsAt, clockNow)
  const warn = session.status !== 'open' || !session.opponentConnected || session.error !== null
  const line =
    session.status !== 'open'
      ? 'Connection lost. Reconnecting…'
      : !session.opponentConnected
        ? `${opponentName} has dropped out. Waiting for them to come back…`
        : seatUnstored
          ? 'This browser is blocking storage, so a refresh will not bring you back to this room.'
          : (session.error ?? (yourTurn ? 'Your turn' : `${opponentName} is playing…`))

  return (
    <VariantContext value={variantOf}>
      <div className="online__bar">
        <span>
          {entry.ticket ? 'Ranked · ' : ''}Room {session.code}
        </span>
        <span className={warn ? 'online__bar--warn' : ''} role="status">
          {conceding ? 'Concede this match? Your opponent wins it.' : line}
        </span>
        {left !== null && (
          <span
            className={`online__bar__clock${left <= CLOCK_URGENT_S ? ' online__bar__clock--urgent' : ''}`}
            // The digits redraw every second, so reading them out would be unbearable. The
            // label carries the time in words and only the last fifteen seconds are announced,
            // which is the point at which the clock costs the match (DESIGN.md 13).
            aria-label={clockLabel(left, yourTurn)}
            role={left <= CLOCK_URGENT_S && yourTurn ? 'alert' : undefined}
          >
            <span aria-hidden="true">
              {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
            </span>
          </span>
        )}
        {conceding ? (
          <>
            <button
              type="button"
              className="button button--small button--primary"
              onClick={() => {
                setConceding(false)
                client.current?.concede()
              }}
            >
              Concede
            </button>
            <button
              type="button"
              className="button button--small button--ghost"
              onClick={() => setConceding(false)}
            >
              Stay
            </button>
          </>
        ) : (
          <button type="button" className="button button--small" onClick={() => setConceding(true)}>
            Leave
          </button>
        )}
      </div>
      <Board
        state={view}
        viewer={seat}
        names={session.names}
        plates={session.plates}
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
