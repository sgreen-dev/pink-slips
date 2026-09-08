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
import { blockedReason, handNote, whyNotPlayable, whyNotTarget } from './explain.ts'
import { Garage } from './Garage.tsx'
import {
  buttonActions,
  carIntents,
  handedOver,
  modIntent,
  prompt,
  turnSummary,
  type CarIntent,
  type Selection,
} from './interaction.ts'
import { ModCard } from './ModCard.tsx'
import { describeLogEntry } from './narrate.ts'
import { RaceTrack } from './RaceTrack.tsx'
import { RulesButton, RulesDialog } from './RulesDialog.tsx'
import { scrollPageBack, scrollRowBack } from './scroll.ts'
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
  // When the viewer's turn ends, the rows that were scrolled return to their start and the page
  // to its top (DESIGN.md 8, Board order), so the next turn opens on the view the race began with.
  const [turns, setTurns] = useState({ state, viewer, ended: 0 })
  if (turns.state !== state || turns.viewer !== viewer) {
    const ended = handedOver(turns.state, state, turns.viewer) ? turns.ended + 1 : turns.ended
    setTurns({ state, viewer, ended })
  }
  const hand = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    scrollRowBack(hand.current)
    scrollPageBack()
  }, [turns.ended])
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
                className="button button--small button--primary"
                onClick={onExit}
              >
                Leave
              </button>
              <button
                type="button"
                className="button button--small button--ghost"
                onClick={() => setConfirmExit(false)}
              >
                Stay
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
          handCount={state.players[opponent].hand.length}
          onOther={onOther(opponent)}
          size="sm"
          raceNumber={state.race.number}
          turnsEnded={turns.ended}
        />
      </VariantContext>

      <RaceTrack state={state} names={names} lanes={[opponent, viewer]} frozen={frozen} />

      <Garage
        player={me}
        name={names[viewer]}
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
                  onClick={() => onAction(action)}
                  disabled={busy}
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
            return (
              <div key={modId} className="hand__slot">
                <ModCard
                  modId={modId}
                  playable={playable}
                  note={note}
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
