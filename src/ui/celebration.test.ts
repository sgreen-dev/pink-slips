import { describe, expect, it } from 'vitest'
import { apply, TUNABLES, type MatchState } from '../engine/index.ts'
import { endModsAndAdvance, scenario, starterConfig } from '../engine/test-helpers.ts'
import { raceEndBetween, reduceSession, startSession, type Session } from './celebration.ts'

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
  const start: Session = { match: nearTheLine(), raceEnd: null }
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
