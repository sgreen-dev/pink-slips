import { describe, expect, it } from 'vitest'
import {
  apply,
  createMatch,
  currentPlayer,
  legalActions,
  TUNABLES,
  type MatchState,
  type PlayerIndex,
} from '../engine/index.ts'
import {
  endModsAndAdvance,
  playOutRandomly,
  scenario,
  starterConfig,
} from '../engine/test-helpers.ts'
import {
  canUndo,
  raceEndBetween,
  reduceSession,
  startSession,
  type Session,
} from './celebration.ts'

const MIATA = 'mazda-mx-5-miata'
const GR86 = 'toyota-gr86'
const PORSCHE = 'porsche-911-carrera-s'
const LOTUS = 'lotus-emira'

/** Player 0 sits a few feet from the line with a fueled car, so the next advance wins the race. */
function nearTheLine(distanceFt: readonly [number, number] = [1300, 400]): MatchState {
  return scenario({
    players: [{ cars: [{ id: MIATA, fuel: 6 }, PORSCHE] }, { cars: [GR86, LOTUS] }],
    distanceFt,
  })
}

describe('raceEndBetween', () => {
  it('records the winner, the captured car, and where the cars stopped', () => {
    const before = nearTheLine()
    const after = endModsAndAdvance(before)
    const end = raceEndBetween(before, after)
    expect(end).toMatchObject({
      race: 1,
      winner: 0,
      loser: 1,
      winningCarId: MIATA,
      capturedCarId: GR86,
      slips: 1,
      matchOver: false,
    })
    expect(end?.distanceFt[0]).toBeGreaterThanOrEqual(TUNABLES.trackLengthFt)
    expect(end?.distanceFt[1]).toBe(400)
    // The engine has already moved on; the record is what the board holds instead.
    expect(after.race.distanceFt).toEqual([0, 0])
    expect(after.phase.kind).toBe('staging')
  })

  it('is null while the race goes on', () => {
    const before = nearTheLine([0, 400])
    expect(raceEndBetween(before, apply(before, { type: 'endMods', player: 0 }))).toBeNull()
    expect(raceEndBetween(before, endModsAndAdvance(before))).toBeNull()
  })

  it('marks the pink slip that ends the match', () => {
    const start = nearTheLine()
    const before: MatchState = {
      ...start,
      players: [{ ...start.players[0], pinkSlips: [LOTUS, PORSCHE] }, start.players[1]],
    }
    const after = endModsAndAdvance(before)
    expect(after.phase.kind).toBe('over')
    expect(raceEndBetween(before, after)).toMatchObject({ slips: 3, matchOver: true })
  })
})

describe('reduceSession', () => {
  const start: Session = { match: nearTheLine(), raceEnd: null, history: [] }
  const endMods = { type: 'act', action: { type: 'endMods', player: 0 } } as const
  const advance = { type: 'act', action: { type: 'advance', player: 0 } } as const
  const cpuStages = { type: 'cpuStep', seat: 1, seed: 1 } as const

  it('starts a match with nothing held', () => {
    const session = startSession({ config: starterConfig(), seed: 1 })
    expect(session.raceEnd).toBeNull()
    expect(session.match.race.number).toBe(1)
    expect(reduceSession(session, { type: 'continue' })).toBe(session)
  })

  it('leaves the CPU alone when it is not its seat', () => {
    expect(reduceSession(start, cpuStages)).toBe(start)
  })

  it('holds the board at the line until Continue, then lets the CPU stage', () => {
    const ended = reduceSession(reduceSession(start, endMods), advance)
    expect(ended.raceEnd?.winner).toBe(0)
    expect(ended.match.phase.kind).toBe('staging')

    // The loser stages first, but not while the banner is up; nor does a stray click count.
    expect(reduceSession(ended, cpuStages)).toBe(ended)
    const stray = { type: 'act', action: { type: 'stage', player: 1, carId: LOTUS } } as const
    expect(reduceSession(ended, stray)).toBe(ended)

    const resumed = reduceSession(ended, { type: 'continue' })
    expect(resumed.raceEnd).toBeNull()
    expect(resumed.match).toBe(ended.match)

    const staged = reduceSession(resumed, cpuStages)
    expect(staged.match.players[1].stagedCarId).toBe(LOTUS)
    expect(staged.raceEnd).toBeNull()
  })
})

/** Walks a match at random until the acting player can play a mod of the given type. */
function untilPlayable(type: 'playPart' | 'playBoost' | 'playSabotage', seed: number) {
  let state = createMatch(starterConfig(seed % 3, (seed + 1) % 3), seed)
  for (let i = 0; i < 400; i++) {
    const acting = currentPlayer(state)
    if (acting !== null && state.phase.kind === 'turn' && state.turn.step === 'mods') {
      const play = legalActions(state, acting).find((a) => a.type === type)
      if (play) return { state, acting, play }
    }
    const next = playOutRandomly(state, seed + i, 1)
    if (next === state) break
    state = next
  }
  throw new Error(`No ${type} came up for seed ${seed}`)
}

describe('undo', () => {
  it('takes back the last mod play, and a second one before it', () => {
    const { state, acting, play } = untilPlayable('playPart', 4)
    let session: Session = { match: state, raceEnd: null, history: [] }
    expect(canUndo(session, acting)).toBe(false)
    session = reduceSession(session, { type: 'act', action: play })
    expect(session.history).toHaveLength(1)
    expect(canUndo(session, acting)).toBe(true)
    expect(canUndo(session, acting === 0 ? 1 : 0)).toBe(false)
    const second = legalActions(session.match, acting).find(
      (a) => a.type === 'playBoost' || a.type === 'playSabotage' || a.type === 'playPart',
    )
    if (second) {
      const afterFirst = session.match
      session = reduceSession(session, { type: 'act', action: second })
      expect(session.history).toHaveLength(2)
      session = reduceSession(session, { type: 'undo', player: acting })
      expect(session.match).toEqual(afterFirst)
    }
    session = reduceSession(session, { type: 'undo', player: acting })
    expect(session.match).toEqual(state)
    expect(session.history).toEqual([])
    expect(reduceSession(session, { type: 'undo', player: acting })).toBe(session)
  })

  it('makes plays final when the mod step ends or the turn moves on', () => {
    const { state, acting, play } = untilPlayable('playPart', 7)
    let session: Session = { match: state, raceEnd: null, history: [] }
    session = reduceSession(session, { type: 'act', action: play })
    const end = legalActions(session.match, acting).find((a) => a.type === 'endMods')
    expect(end).toBeDefined()
    session = reduceSession(session, { type: 'act', action: end as typeof play })
    expect(session.history).toEqual([])
    expect(canUndo(session, acting)).toBe(false)
    // A CPU step is a normal act and clears the stack too.
    const { state: s2, acting: a2, play: p2 } = untilPlayable('playPart', 9)
    let cpu: Session = { match: s2, raceEnd: null, history: [] }
    cpu = reduceSession(cpu, { type: 'act', action: p2 })
    expect(cpu.history).toHaveLength(1)
    cpu = reduceSession(cpu, { type: 'cpuStep', seat: a2 as PlayerIndex, seed: 1 })
    expect(cpu.history.length).toBeLessThanOrEqual(2)
    const other = (a2 === 0 ? 1 : 0) as PlayerIndex
    expect(reduceSession(cpu, { type: 'undo', player: other })).toBe(cpu)
  })
})
