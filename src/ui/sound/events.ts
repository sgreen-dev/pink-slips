import { TUNABLES, type MatchState, type PlayerIndex } from '../../engine/index.ts'
import type { SoundName } from './sfx.ts'

/**
 * Which sounds a change of state calls for (DESIGN.md 8). Reads the log entries `next`
 * added, the same way the race-end moment does, so it needs no knowledge of the engine's
 * phases. A race end that also ends the match gets the fanfare instead of the sting.
 */

export interface SoundEvent {
  name: SoundName
  /** For the launch: how far the car went, from 0 to 1. */
  intensity?: number
}

/** A launch across half the track is a full-strength one. */
const FULL_LAUNCH_FT = TUNABLES.trackLengthFt / 2

export function soundsBetween(
  previous: MatchState,
  next: MatchState,
  viewer: PlayerIndex | null,
): SoundEvent[] {
  const added = next.log.slice(previous.log.length)
  const events: SoundEvent[] = []
  const seen = new Set<SoundName>()
  const push = (name: SoundName, intensity?: number) => {
    if (name !== 'advance') {
      if (seen.has(name)) return
      seen.add(name)
    }
    events.push(intensity === undefined ? { name } : { name, intensity })
  }
  const over = added.some((entry) => entry.kind === 'matchEnd')
  for (const entry of added) {
    if (entry.kind === 'stage') push('stage')
    else if (entry.kind === 'fuel') push('fuel')
    else if (entry.kind === 'advance') {
      push('advance', Math.min(1, Math.max(0, (entry.toFt - entry.fromFt) / FULL_LAUNCH_FT)))
    } else if (entry.kind === 'advanceSkipped') push('stall')
    else if (entry.kind === 'playBoost') push('boost')
    else if (entry.kind === 'playPart') push('part')
    else if (entry.kind === 'playSabotage') push('sabotage')
    else if (entry.kind === 'tractionIgnored') push('deflect')
    else if (entry.kind === 'coinFlip') push('coin')
    else if (entry.kind === 'raceEnd') {
      if (!over) push('raceEnd')
    } else if (entry.kind === 'matchEnd') push('matchEnd')
    else if (entry.kind === 'draw' || entry.kind === 'reshuffle') push('shuffle')
    else if (entry.kind === 'turnStart' && viewer !== null && entry.player === viewer) {
      push('yourTurn')
    }
  }
  return events
}

/** A state with no log, so the first state of a match sounds its coin flip and draws. */
export function beforeStart(state: MatchState): MatchState {
  return { ...state, log: [] }
}

/**
 * A shuffled order of the tracks from a seed. Redrawn until its first track differs from
 * `avoid`, so a new order after the last one never repeats the track just played.
 */
export function shuffleOrder(
  tracks: readonly string[],
  seed: number,
  avoid: string | null = null,
): string[] {
  let state = seed >>> 0 || 1
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const order = [...tracks]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1))
      const swap = order[i] as string
      order[i] = order[j] as string
      order[j] = swap
    }
    if (order.length < 2 || order[0] !== avoid) return order
  }
  return [...tracks]
}
