import { getCar } from '../data/cars.ts'
import type { Tier } from '../data/types.ts'
import type { LogEntry, MatchState, PlayerIndex } from '../engine/index.ts'

/** Reads one finished match's log into the facts the reports need. */

export interface Tally {
  wins: number
  games: number
}

export function tally(): Tally {
  return { wins: 0, games: 0 }
}

export function rate(t: Tally): number {
  return t.games === 0 ? Number.NaN : t.wins / t.games
}

export interface RaceOutcome {
  winnerTier: Tier
  loserTier: Tier
}

export interface FirstAdvanceDelay {
  tier: Tier
  /** The player's turns from staging the car to its first advance, counting the advance turn. */
  turns: number
}

export interface MatchAnalysis {
  winner: PlayerIndex
  turnsPerPlayer: number
  firstPlayerWon: boolean
  /** Times each player played each mod. */
  modPlays: Map<string, [number, number]>
  races: RaceOutcome[]
  firstAdvanceDelays: FirstAdvanceDelay[]
  /** After a race the winner restaged the same car. */
  keeps: number
  /** After a race the winner swapped to a different car. */
  swaps: number
}

export function analyzeMatch(state: MatchState, winner: PlayerIndex): MatchAnalysis {
  const modPlays = new Map<string, [number, number]>()
  const races: RaceOutcome[] = []
  const delays: FirstAdvanceDelay[] = []
  const staged: [string | null, string | null] = [null, null]
  const turnsSinceStage: [number, number] = [0, 0]
  const advancedThisRace: [boolean, boolean] = [false, false]
  let keeps = 0
  let swaps = 0
  let lastWinner: { player: PlayerIndex; carId: string } | null = null

  const countPlay = (player: PlayerIndex, modId: string) => {
    const counts = modPlays.get(modId) ?? [0, 0]
    counts[player]++
    modPlays.set(modId, counts)
  }

  for (const entry of state.log) {
    switch (entry.kind) {
      case 'stage':
        if (lastWinner && lastWinner.player === entry.player) {
          if (lastWinner.carId === entry.carId) keeps++
          else swaps++
          lastWinner = null
        }
        staged[entry.player] = entry.carId
        turnsSinceStage[entry.player] = 0
        advancedThisRace[entry.player] = false
        break
      case 'turnStart':
        turnsSinceStage[entry.player]++
        break
      case 'advance':
        if (!advancedThisRace[entry.player]) {
          advancedThisRace[entry.player] = true
          delays.push({ tier: getCar(entry.carId).tier, turns: turnsSinceStage[entry.player] })
        }
        break
      case 'playPart':
      case 'playBoost':
      case 'playSabotage':
        countPlay(entry.player, entry.modId)
        break
      case 'raceEnd': {
        const winnerCar = staged[entry.winner]
        if (winnerCar !== null) {
          races.push({
            winnerTier: getCar(winnerCar).tier,
            loserTier: getCar(entry.capturedCarId).tier,
          })
          lastWinner = { player: entry.winner, carId: winnerCar }
        }
        break
      }
      default:
        break
    }
  }

  return {
    winner,
    turnsPerPlayer: Math.ceil(state.turn.number / 2),
    firstPlayerWon: winner === state.firstPlayer,
    modPlays,
    races,
    firstAdvanceDelays: delays,
    keeps,
    swaps,
  }
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const a = sorted[mid] ?? Number.NaN
  const b = sorted[mid - 1] ?? a
  return sorted.length % 2 === 1 ? a : (a + b) / 2
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))
  return sorted[index] ?? Number.NaN
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Only entries the analyzer reads, for tests that build logs by hand. */
export type AnalyzedEntry = Extract<
  LogEntry,
  {
    kind: 'stage' | 'turnStart' | 'advance' | 'playPart' | 'playBoost' | 'playSabotage' | 'raceEnd'
  }
>
