/**
 * The guided first match (DESIGN.md 8 and 9): five short steps, one at a time, over a browser's
 * first CPU match. The texts are held to the rules dialog's limits by the same kind of test, and
 * `guideStep` reads the board the way the prompt does. Remembered once finished or skipped.
 */

import { currentPlayer, TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'
import type { RaceEnd } from './celebration.ts'
import { browserStorage, readRecord, writeRecord, type StorageLike } from '../browser/storage.ts'

export const GUIDE_KEY = 'pink-slips.guide.v1'

interface GuideRecord {
  done: boolean
}

function isGuideRecord(value: unknown): value is GuideRecord {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Record<string, unknown>)['done'] === 'boolean'
}

/** True once the guide finished or was skipped in this browser. */
export function loadGuideDone(store: StorageLike | null = browserStorage()): boolean {
  return readRecord(GUIDE_KEY, isGuideRecord, store)?.done ?? false
}

export function saveGuideDone(store: StorageLike | null = browserStorage()): boolean {
  return writeRecord(GUIDE_KEY, { done: true }, store)
}

/** The steps in the order a first match asks for them; fuel, mods, and advance are the turn's. */
export type GuideStepId = 'stage' | 'fuel' | 'mods' | 'advance' | 'finish'

export const GUIDE_ORDER: readonly GuideStepId[] = ['stage', 'fuel', 'mods', 'advance', 'finish']

export interface GuideStep {
  text: string
  /** Where the callout points: up at the garage, down at the buttons and hand, or nowhere. */
  toward: 'up' | 'down' | 'none'
}

/** The step texts. Every number comes from the tunables, as the rules dialog's do. */
export function guideSteps(
  t: { readonly pinkSlipsToWin: number } = TUNABLES,
): Readonly<Record<GuideStepId, GuideStep>> {
  return {
    stage: {
      text: 'Stage a car: pick any car with the pink outline. It races for you until this race ends.',
      toward: 'up',
    },
    fuel: {
      text: 'Place a fuel token on your staged car. Fuel makes cars go: a car moves once it has enough.',
      toward: 'up',
    },
    mods: {
      text: 'Mods are the cards in your hand below: each changes how the cars race. Play any you want, then press End mod step.',
      toward: 'down',
    },
    advance: {
      text: 'Your car is fueled: press Advance to move it down the track. Fuel is not spent, so it moves again each turn.',
      toward: 'down',
    },
    finish: {
      text: `That was one race. The winner takes the losing car as a pink slip, and it is out for the rest of this match. Collect ${t.pinkSlipsToWin} pink slips and you win the match. Press Continue for the next race.`,
      toward: 'none',
    },
  }
}

export function guideText(steps: Readonly<Record<GuideStepId, GuideStep>>): string {
  return GUIDE_ORDER.map((id) => steps[id].text).join('\n')
}

export function guideWordCount(steps: Readonly<Record<GuideStepId, GuideStep>>): number {
  return guideText(steps).split(/\s+/).filter(Boolean).length
}

/**
 * The step the board is at for the viewer, or null when the guide has nothing to say: a held
 * race end is the finish step; otherwise nothing while it is not the viewer's turn, while a
 * selection or a Sponsor's options are open (`busy`), or in the choice phase.
 */
export function guideStep(
  state: MatchState,
  viewer: PlayerIndex,
  raceEnd: RaceEnd | null,
  busy: boolean,
): GuideStepId | null {
  if (raceEnd !== null) return 'finish'
  if (busy || currentPlayer(state) !== viewer) return null
  const { phase } = state
  if (phase.kind === 'staging') return state.players[viewer].stagedCarId === null ? 'stage' : null
  if (phase.kind !== 'turn') return null
  return state.turn.step
}
