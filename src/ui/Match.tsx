import { useState } from 'react'
import {
  apply,
  createMatch,
  currentPlayer,
  isOver,
  type Action,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'
import { Board } from './Board.tsx'
import { HandOverScreen } from './HandOverScreen.tsx'
import { NO_SELECTION, type Selection } from './interaction.ts'
import { ResultScreen } from './ResultScreen.tsx'

interface MatchProps {
  config: MatchConfig
  seed: number
  names: readonly [string, string]
  onRematch: () => void
  onNewMatch: () => void
}

/** Owns one match: the engine state, the hotseat hand-over, and the board's selection. */
export function Match({ config, seed, names, onRematch, onNewMatch }: MatchProps) {
  const [state, setState] = useState<MatchState>(() => createMatch(config, seed))
  const [revealedFor, setRevealedFor] = useState<PlayerIndex | null>(null)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [options, setOptions] = useState<Action[] | null>(null)

  const winner = isOver(state)
  if (winner !== null) {
    return (
      <ResultScreen
        state={state}
        winner={winner}
        names={names}
        onRematch={onRematch}
        onNewMatch={onNewMatch}
      />
    )
  }

  const acting = currentPlayer(state)
  if (acting === null) return null
  if (revealedFor !== acting) {
    const note =
      state.phase.kind === 'staging'
        ? `Race ${state.race.number}`
        : state.phase.kind === 'choice'
          ? 'Parts Thief'
          : `Race ${state.race.number} · Turn ${state.turn.number}`
    return (
      <HandOverScreen name={names[acting]} note={note} onReveal={() => setRevealedFor(acting)} />
    )
  }

  const onAction = (action: Action) => {
    setState((current) => apply(current, action))
    setSelection(NO_SELECTION)
    setOptions(null)
  }

  return (
    <Board
      state={state}
      viewer={acting}
      names={names}
      selection={selection}
      options={options}
      onAction={onAction}
      onSelect={setSelection}
      onOptions={setOptions}
    />
  )
}
