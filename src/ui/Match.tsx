import { useEffect, useState } from 'react'
import { chooseAction } from '../cpu/index.ts'
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

export type Mode = 'cpu' | 'hotseat'

/** The CPU always sits in seat 1; the human is seat 0. */
const CPU_SEAT: PlayerIndex = 1
const HUMAN_SEAT: PlayerIndex = 0

/** Pause between CPU actions so a player can follow each one on the board and in the log. */
const CPU_STEP_MS = 700

interface MatchProps {
  mode: Mode
  config: MatchConfig
  seed: number
  names: readonly [string, string]
  onRematch: () => void
  onNewMatch: () => void
}

/** Owns one match: the engine state, the CPU's turns, the hotseat hand-over, and the selection. */
export function Match({ mode, config, seed, names, onRematch, onNewMatch }: MatchProps) {
  const [state, setState] = useState<MatchState>(() => createMatch(config, seed))
  const [revealedFor, setRevealedFor] = useState<PlayerIndex | null>(null)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [options, setOptions] = useState<Action[] | null>(null)
  const cpu = mode === 'cpu'

  useEffect(() => {
    if (!cpu || isOver(state) !== null || currentPlayer(state) !== CPU_SEAT) return
    const timer = setTimeout(() => {
      setState((current) => {
        if (isOver(current) !== null || currentPlayer(current) !== CPU_SEAT) return current
        return apply(current, chooseAction(current, CPU_SEAT, seed))
      })
    }, CPU_STEP_MS)
    return () => clearTimeout(timer)
  }, [cpu, state, seed])

  const winner = isOver(state)
  if (winner !== null) {
    const title = cpu
      ? winner === HUMAN_SEAT
        ? 'You win'
        : 'The CPU wins'
      : `${names[winner]} wins`
    return (
      <ResultScreen
        state={state}
        winner={winner}
        names={names}
        title={title}
        onRematch={onRematch}
        onNewMatch={onNewMatch}
      />
    )
  }

  const acting = currentPlayer(state)
  if (acting === null) return null
  const viewer: PlayerIndex = cpu ? HUMAN_SEAT : acting
  if (!cpu && revealedFor !== acting) {
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
      viewer={viewer}
      names={names}
      selection={selection}
      options={options}
      onAction={onAction}
      onSelect={setSelection}
      onOptions={setOptions}
    />
  )
}
