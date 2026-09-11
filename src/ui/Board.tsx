import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getMod } from '../data/mods.ts'
import {
  otherPlayer,
  type Action,
  type MatchState,
  type PlayerIndex,
  currentPlayer,
} from '../engine/index.ts'
import type { RaceEnd } from './celebration.ts'
import { Callout } from './Callout.tsx'
import { blockedReason, stallWarning, handNote, whyNotPlayable, whyNotTarget } from './explain.ts'
import { Garage } from './Garage.tsx'
import {
  buttonActions,
  carIntents,
  canStage,
  handedOver,
  opponentAdvanced,
  modIntent,
  prompt,
  turnSummary,
  type CarIntent,
  type Selection,
} from './interaction.ts'
import { ModCard } from './ModCard.tsx'
import { describeLogEntry } from './narrate.ts'
import { RaceTrack } from './RaceTrack.tsx'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { reveal, scrollPageTop, scrollRowBack, TURN_END_RESET_MS } from './scroll.ts'
import { SoundButton } from './sound/SoundButton.tsx'
import { useSound } from './sound/useSound.ts'
import { BASE_ONLY, VariantContext } from './variants.ts'

/** A refused play's notice (DESIGN.md 8, Refused plays). */
interface Notice {
  text: string
  toward: 'up' | 'down'
  /** Counts refusals, so the same refusal twice replays the fade. */
  at: number
}

interface BoardProps {
  state: MatchState
  viewer: PlayerIndex
  names: readonly [string, string]
  selection: Selection
  /** Sponsor's list of Parts to fetch, when the player is choosing one. */
  options: Action[] | null
  onAction: (action: Action) => void
  onSelect: (selection: Selection) => void
  onOptions: (options: Action[] | null) => void
  /** A race that just ended; the track holds at its finishing positions. */
  frozen?: RaceEnd | null
  /** True while the race-end banner is up, so nothing on the board takes clicks or focus. */
  inert?: boolean
  /** The viewer can take back the last mod they played this step. */
  canUndo?: boolean
  onUndo?: () => void
  /** Leaves a local match from the header, behind a confirm; absent online. */
  onExit?: () => void
  /** Draw the opponent's cards without finishes, as for the CPU. */
  plainOpponent?: boolean
  /** Each seat's laps for its plate, online (DESIGN.md 12). */
  plates?: readonly [number, number]
  /** The first-match guide's callout, drawn under the prompt (DESIGN.md 8). */
  guide?: ReactNode
}

function buttonLabel(action: Action): string {
  switch (action.type) {
    case 'endMods':
      return 'End mod step'
    case 'advance':
      return 'Advance'
    case 'discardPart':
      return `Give up ${getMod(action.modId).name}`
    default:
      return action.type
  }
}

export function Board({
  state,
  viewer,
  names,
  selection,
  options,
  onAction,
  onSelect,
  onOptions,
  frozen,
  inert,
  plainOpponent,
  plates,
  guide,
  canUndo = false,
  onUndo,
  onExit,
}: BoardProps) {
  const opponent = otherPlayer(viewer)
  const me = state.players[viewer]
  const intents = carIntents(state, viewer, selection)
  const buttons = buttonActions(state, viewer)
  const handIds = [...new Set(me.hand)]
  const busy = selection.kind !== 'none' || options !== null
  const [confirmExit, setConfirmExit] = useState(false)
  // The viewer's own turn: the prompt and the next-step button breathe so the next step is obvious.
  const live = !inert && currentPlayer(state) === viewer
  const hint = inert ? null : handNote(state, viewer)
  const rules = useRef<HTMLDialogElement>(null)
  const variantOf = useContext(VariantContext)
  const sound = useSound()
  // The notice is set by a tap that cannot act and cleared by OK or by the next change of state
  // or selection, noticed during render.
  const [notice, setNotice] = useState<Notice | null>(null)
  const [noticeFor, setNoticeFor] = useState({ state, selection })
  if (noticeFor.state !== state || noticeFor.selection !== selection) {
    // The other player's moves leave a notice alone; the viewer's own move, or their turn
    // arriving, clears it.
    const theirs = currentPlayer(noticeFor.state) !== viewer && currentPlayer(state) !== viewer
    setNoticeFor({ state, selection })
    if (notice && !(theirs && noticeFor.selection === selection)) setNotice(null)
  }
  // The camera (DESIGN.md 8, Board order). The viewer's turns ended and the other player's
  // advances are counted during render; each count drives one move below.
  const [turns, setTurns] = useState({ state, viewer, ended: 0, advances: 0 })
  if (turns.state !== state || turns.viewer !== viewer) {
    const ended = handedOver(turns.state, state, turns.viewer) ? turns.ended + 1 : turns.ended
    const advances = opponentAdvanced(turns.state, state, viewer)
      ? turns.advances + 1
      : turns.advances
    setTurns({ state, viewer, ended, advances })
  }
  const hand = useRef<HTMLDivElement | null>(null)
  const track = useRef<HTMLDivElement | null>(null)
  const mine = useRef<HTMLElement | null>(null)
  // A turn's end: after a beat, the hand returns to its start and the track comes into view, so
  // the other player's turn plays where it can be seen.
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollRowBack(hand.current)
      reveal(track.current)
    }, TURN_END_RESET_MS)
    return () => clearTimeout(timer)
  }, [turns.ended])
  // The other player's advance brings the track into view at once.
  useEffect(() => {
    if (turns.advances === 0) return
    return reveal(track.current)
  }, [turns.advances])
  // An advance leads with the track: it is dispatched once the track is in view, and the buttons
  // are held for that beat.
  const [revealing, setRevealing] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  useEffect(() => () => pending.current?.(), [])
  // Continue after a race opens the next race at the top of the page, unless the viewer is the
  // one staging, in which case the move below shows them their cars instead.
  const wasFrozen = useRef(frozen !== null)
  useEffect(() => {
    if (wasFrozen.current && frozen === null && !canStage(state, viewer)) scrollPageTop()
    wasFrozen.current = frozen !== null
  }, [frozen, state, viewer])
  // The viewer's turn to stage brings their own garage into view, so the cars they are being
  // asked about are on screen without a scroll. Once per staging turn, and never under the
  // race-end banner, which is still up while the engine has already moved on to staging. The
  // guide owns the first board of a first match, so its callout suppresses the move.
  const staged = useRef<string | null>(null)
  const stagingKey =
    frozen === null && guide === undefined && canStage(state, viewer)
      ? `${state.race.number}:${viewer}`
      : null
  useEffect(() => {
    if (stagingKey === null || staged.current === stagingKey) return
    staged.current = stagingKey
    return reveal(mine.current)
  }, [stagingKey])
  const act = (action: Action) => {
    if (action.type !== 'advance') {
      onAction(action)
      return
    }
    setRevealing(true)
    pending.current = reveal(track.current, () => {
      pending.current = null
      setRevealing(false)
      onAction(action)
    })
  }
  const refuse = (text: string, toward: 'up' | 'down') => {
    setNotice((prev) => ({ text, toward, at: (prev?.at ?? 0) + 1 }))
    sound.play('deflect')
  }
  // While a card waits for a car, a tap on any other car says why it is not a target.
  const onOther = (owner: PlayerIndex) =>
    selection.kind === 'none'
      ? undefined
      : (carId: string) => {
          const why = whyNotTarget(viewer, selection, carId, owner)
          if (why) refuse(why, 'up')
        }

  const onCar = (_carId: string, intent: CarIntent) => {
    if (intent.kind === 'apply') {
      onAction(intent.action)
      onSelect({ kind: 'none' })
    } else {
      onSelect(intent.selection)
    }
  }

  const onMod = (modId: string) => {
    const intent = modIntent(state, viewer, modId)
    switch (intent.kind) {
      case 'apply':
        onAction(intent.action)
        break
      case 'select':
        onSelect(intent.selection)
        break
      case 'options':
        onOptions(intent.options)
        break
      case 'unplayable':
        break
    }
  }

  // Escape backs out of a Part, Tow Truck, or Sponsor selection.
  useEffect(() => {
    if (!busy) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onSelect({ kind: 'none' })
        onOptions(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onSelect, onOptions])

  const log = state.log
    .map((entry) => describeLogEntry(entry, names))
    .filter((line): line is string => line !== null)
    .slice(-8)

  return (
    <main className="board" inert={inert}>
      {/* The board had no backdrop while every other screen did, which left the race looking
          like the one unfinished room. It borrows the start screen's road scene, under a much
          heavier wash than the start screen uses (see `.board .backdrop`). */}
      <Backdrop image={backdropUrl('start-screen2')} />
      <header className="board__header">
        <span className="board__brand">Pink Slips</span>
        <span className="board__status">{turnSummary(state, names)}</span>
        <RulesButton dialogRef={rules} label="Rules" small />
        <SoundButton />
        {onExit &&
          (confirmExit ? (
            <span className="board__confirm">
              Leave this match? It will not count.
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setConfirmExit(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className="button button--small button--primary"
                onClick={onExit}
              >
                Leave
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setConfirmExit(true)}
            >
              Exit match
            </button>
          ))}
      </header>

      <VariantContext value={plainOpponent ? BASE_ONLY : variantOf}>
        <Garage
          player={state.players[opponent]}
          name={names[opponent]}
          plate={plates?.[opponent]}
          handCount={state.players[opponent].hand.length}
          onOther={onOther(opponent)}
          size="sm"
          raceNumber={state.race.number}
          turnsEnded={turns.ended}
        />
      </VariantContext>

      <RaceTrack
        ref={track}
        state={state}
        names={names}
        lanes={[opponent, viewer]}
        frozen={frozen}
      />

      <Garage
        ref={mine}
        player={me}
        name={names[viewer]}
        plate={plates?.[viewer]}
        intents={busy && options ? undefined : intents}
        selection={selection}
        onCar={onCar}
        onOther={onOther(viewer)}
        size="sm"
        raceNumber={state.race.number}
        turnsEnded={turns.ended}
      />

      <section className="controls">
        <p
          className={`controls__prompt ${live ? 'controls__prompt--live' : ''}`}
          aria-live="polite"
        >
          {prompt(state, viewer, selection, names)}
          {canUndo && !busy ? ' Undo takes back your last mod.' : ''}
        </p>
        {guide}
        {notice && (
          <Callout key={notice.at} tone="notice" toward={notice.toward} text={notice.text}>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setNotice(null)}
            >
              OK
            </button>
          </Callout>
        )}
        <div className="controls__buttons">
          {options
            ? options.map((action) => (
                <button
                  key={
                    action.type === 'playBoost' ? (action.targetModId ?? action.modId) : action.type
                  }
                  type="button"
                  className={`button button--primary ${live ? 'button--next' : ''}`}
                  onClick={() => {
                    onAction(action)
                    onOptions(null)
                  }}
                >
                  Fetch{' '}
                  {action.type === 'playBoost' && action.targetModId
                    ? getMod(action.targetModId).name
                    : ''}
                </button>
              ))
            : buttons.map((action) => (
                <button
                  key={`${action.type}-${'modId' in action ? action.modId : ''}`}
                  type="button"
                  className={`button ${action.type === 'advance' ? 'button--primary' : ''} ${
                    live && !busy ? 'button--next' : ''
                  }`}
                  onClick={() => act(action)}
                  disabled={busy || revealing}
                >
                  {buttonLabel(action)}
                </button>
              ))}
          {busy && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                onSelect({ kind: 'none' })
                onOptions(null)
              }}
            >
              Cancel
            </button>
          )}
          {canUndo && !busy && onUndo && (
            <button type="button" className="button button--ghost" onClick={onUndo}>
              Undo
            </button>
          )}
        </div>
      </section>

      <section className="hand">
        <header className="hand__header">
          Your hand · {me.hand.length} cards
          {hint && <span className="hand__note">{hint}</span>}
        </header>
        <div className="hand__cards" ref={hand}>
          {handIds.map((modId) => {
            const count = me.hand.filter((id) => id === modId).length
            const playable = !busy && modIntent(state, viewer, modId).kind !== 'unplayable'
            const note = live && !busy ? blockedReason(state, viewer, modId) : null
            // A card can be playable and still cost the turn its advance, which the CPU is
            // guarded against and the player was not (DESIGN.md 3.2).
            const caution = live && !busy && !note ? stallWarning(state, viewer, modId) : null
            return (
              <div key={modId} className="hand__slot">
                <ModCard
                  modId={modId}
                  playable={playable}
                  note={note ?? caution}
                  selected={selection.kind !== 'none' && selection.modId === modId}
                  onClick={() => onMod(modId)}
                  onRefuse={() =>
                    refuse(whyNotPlayable(state, viewer, modId, selection, options, names), 'down')
                  }
                />
                {count > 1 && <span className="hand__count">×{count}</span>}
              </div>
            )
          })}
          {handIds.length === 0 && <p className="hand__empty">No cards in hand.</p>}
        </div>
      </section>

      <section className="log">
        <header className="log__header">Match log</header>
        <ol className="log__lines">
          {log.map((line, i) => (
            <li key={`${i}-${line}`}>{line}</li>
          ))}
        </ol>
      </section>
      <RulesDialog dialogRef={rules} />
    </main>
  )
}
