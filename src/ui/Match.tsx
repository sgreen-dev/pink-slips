import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'
import { packsEarned } from '../collection/collection.ts'
import type { Level } from '../cpu/index.ts'
import { addPacks, loadCollection } from '../collection/persist.ts'
import {
  currentPlayer,
  isOver,
  type Action,
  type MatchConfig,
  type PlayerIndex,
} from '../engine/index.ts'
import { AccountContext, reportCpuResult } from './account.ts'
import { Board } from './Board.tsx'
import { reduceSession, startSession } from './celebration.ts'
import { recordMatch } from './counter.ts'
import { HandOverScreen } from './HandOverScreen.tsx'
import { NO_SELECTION, type Selection } from './interaction.ts'
import { RaceEndBanner } from './RaceEndBanner.tsx'
import { ResultScreen } from './ResultScreen.tsx'
import { VariantContext, lookupFrom } from './variants.ts'

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
  /** CPU difficulty; ignored in hotseat. */
  level: Level
  onRematch: () => void
  onNewMatch: () => void
}

/**
 * Owns one match: the engine state, the CPU's turns, the moment after each finish line, the
 * hotseat hand-over, and the selection.
 */
export function Match({ mode, config, seed, names, level, onRematch, onNewMatch }: MatchProps) {
  const [session, dispatch] = useReducer(reduceSession, { config, seed }, startSession)
  const { match: state, raceEnd } = session
  const [revealedFor, setRevealedFor] = useState<PlayerIndex | null>(null)
  const [selection, setSelection] = useState<Selection>(NO_SELECTION)
  const [options, setOptions] = useState<Action[] | null>(null)
  const cpu = mode === 'cpu'
  const recorded = useRef(false)
  /** Packs the account service granted; guests use the local rule at render time. */
  const [granted, setGranted] = useState<number | null>(null)
  const [variantOf] = useState(() => lookupFrom(loadCollection().variants))
  const account = useContext(AccountContext)
  const onContinue = useCallback(() => dispatch({ type: 'continue' }), [])

  // The CPU acts one step at a time and waits while the race-end banner is up.
  useEffect(() => {
    if (!cpu || raceEnd !== null || isOver(state) !== null || currentPlayer(state) !== CPU_SEAT) {
      return
    }
    const timer = setTimeout(
      () => dispatch({ type: 'cpuStep', seat: CPU_SEAT, seed, level }),
      CPU_STEP_MS,
    )
    return () => clearTimeout(timer)
  }, [cpu, state, raceEnd, seed, level])

  const winner = isOver(state)
  useEffect(() => {
    if (winner === null || recorded.current) return
    recorded.current = true
    void recordMatch()
    const won = winner === HUMAN_SEAT
    if (account) {
      void reportCpuResult(account.endpoint, account.token, mode, won).then((result) => {
        if (!result) return
        account.update(result.data)
        setGranted(result.packs)
      })
    } else {
      addPacks(packsEarned(mode, won))
    }
  }, [winner, mode, account])
  const earned =
    winner === null ? 0 : account ? (granted ?? 0) : packsEarned(mode, winner === HUMAN_SEAT)

  const headline = (player: PlayerIndex) =>
    cpu ? (player === HUMAN_SEAT ? 'You win' : 'The CPU wins') : `${names[player]} wins`

  if (winner !== null && raceEnd === null) {
    return (
      <VariantContext value={variantOf}>
        <ResultScreen
          state={state}
          winner={winner}
          names={names}
          title={headline(winner)}
          packsEarned={earned}
          onRematch={onRematch}
          onNewMatch={onNewMatch}
        />
      </VariantContext>
    )
  }

  const acting = currentPlayer(state)
  if (raceEnd === null) {
    if (acting === null) return null
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
  }

  // While the banner is up the board stays with whoever watched the finish.
  const viewer: PlayerIndex = cpu
    ? HUMAN_SEAT
    : raceEnd !== null
      ? (revealedFor ?? raceEnd.winner)
      : (acting ?? HUMAN_SEAT)

  const onAction = (action: Action) => {
    dispatch({ type: 'act', action })
    setSelection(NO_SELECTION)
    setOptions(null)
  }

  return (
    <VariantContext value={variantOf}>
      <Board
        state={state}
        viewer={viewer}
        names={names}
        selection={selection}
        options={options}
        onAction={onAction}
        onSelect={setSelection}
        onOptions={setOptions}
        frozen={raceEnd}
        inert={raceEnd !== null}
        plainOpponent={cpu}
      />
      {raceEnd !== null && (
        <RaceEndBanner
          raceEnd={raceEnd}
          headline={headline(raceEnd.winner)}
          onContinue={onContinue}
        />
      )}
    </VariantContext>
  )
}
