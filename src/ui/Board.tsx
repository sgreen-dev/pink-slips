import { useContext, useEffect, useRef } from 'react'
import { getMod } from '../data/mods.ts'
import { otherPlayer, type Action, type MatchState, type PlayerIndex } from '../engine/index.ts'
import type { RaceEnd } from './celebration.ts'
import { Garage } from './Garage.tsx'
import {
  buttonActions,
  carIntents,
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
import { SoundButton } from './sound/SoundButton.tsx'
import { BASE_ONLY, VariantContext } from './variants.ts'

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
  /** Draw the opponent's cards without finishes, as for the CPU. */
  plainOpponent?: boolean
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
}: BoardProps) {
  const opponent = otherPlayer(viewer)
  const me = state.players[viewer]
  const intents = carIntents(state, viewer, selection)
  const buttons = buttonActions(state, viewer)
  const handIds = [...new Set(me.hand)]
  const busy = selection.kind !== 'none' || options !== null
  const rules = useRef<HTMLDialogElement>(null)
  const variantOf = useContext(VariantContext)

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
      </header>

      <VariantContext value={plainOpponent ? BASE_ONLY : variantOf}>
        <Garage
          player={state.players[opponent]}
          name={names[opponent]}
          handCount={state.players[opponent].hand.length}
          size="sm"
        />
      </VariantContext>

      <RaceTrack state={state} names={names} lanes={[opponent, viewer]} frozen={frozen} />

      <Garage
        player={me}
        name={names[viewer]}
        intents={busy && options ? undefined : intents}
        selection={selection}
        onCar={onCar}
        size="sm"
      />

      <section className="controls">
        <p className="controls__prompt" aria-live="polite">
          {prompt(state, viewer, selection, names)}
        </p>
        <div className="controls__buttons">
          {options
            ? options.map((action) => (
                <button
                  key={
                    action.type === 'playBoost' ? (action.targetModId ?? action.modId) : action.type
                  }
                  type="button"
                  className="button button--primary"
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
                  className={`button ${action.type === 'advance' ? 'button--primary' : ''}`}
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
        </div>
      </section>

      <section className="hand">
        <header className="hand__header">Your hand · {me.hand.length} cards</header>
        <div className="hand__cards">
          {handIds.map((modId) => {
            const count = me.hand.filter((id) => id === modId).length
            const playable = !busy && modIntent(state, viewer, modId).kind !== 'unplayable'
            return (
              <div key={modId} className="hand__slot">
                <ModCard
                  modId={modId}
                  playable={playable}
                  selected={selection.kind !== 'none' && selection.modId === modId}
                  onClick={() => onMod(modId)}
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
