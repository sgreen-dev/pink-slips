import { describe, expect, it } from 'vitest'
import { createMatch, isOver, type MatchState } from '../../engine/index.ts'
import { playOutRandomly, starterConfig } from '../../engine/test-helpers.ts'
import { beforeStart, hashText, soundsBetween, trackFor } from './events.ts'
import { MENU_TRACK, MENU_VOLUME, RACE_TRACKS, RACE_VOLUME, volumeFor } from './music.ts'

/** Every state along a random play-out, from the first to the last. */
function statesAlong(seed: number): MatchState[] {
  const states: MatchState[] = []
  let state = createMatch(starterConfig(seed % 3, (seed + 1) % 3), seed)
  states.push(state)
  for (let i = 0; i < 600 && isOver(state) === null; i++) {
    const next = playOutRandomly(state, seed + i, 1)
    if (next === state) break
    states.push(next)
    state = next
  }
  return states
}

describe('soundsBetween', () => {
  it('sounds the coin flip and the draw when a match starts, and nothing for no change', () => {
    const state = createMatch(starterConfig(), 3)
    const names = soundsBetween(beforeStart(state), state, 0).map((e) => e.name)
    expect(names).toContain('coin')
    expect(names).toContain('shuffle')
    expect(soundsBetween(state, state, 0)).toEqual([])
  })

  it('follows the log through whole matches', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const states = statesAlong(seed)
      let launches = 0
      let advances = 0
      for (let i = 1; i < states.length; i++) {
        const previous = states[i - 1] as MatchState
        const next = states[i] as MatchState
        const added = next.log.slice(previous.log.length)
        const events = soundsBetween(previous, next, 0)
        const names = events.map((e) => e.name)
        advances += added.filter((e) => e.kind === 'advance').length
        launches += events.filter((e) => e.name === 'advance').length
        for (const event of events) {
          if (event.name === 'advance') {
            expect(event.intensity).toBeGreaterThanOrEqual(0)
            expect(event.intensity).toBeLessThanOrEqual(1)
          }
        }
        if (added.some((e) => e.kind === 'advanceSkipped')) expect(names).toContain('stall')
        if (added.some((e) => e.kind === 'playSabotage')) expect(names).toContain('sabotage')
        if (added.some((e) => e.kind === 'playBoost')) expect(names).toContain('boost')
        const raceEnded = added.some((e) => e.kind === 'raceEnd')
        const matchEnded = added.some((e) => e.kind === 'matchEnd')
        if (matchEnded) {
          expect(names).toContain('matchEnd')
          expect(names).not.toContain('raceEnd')
        } else if (raceEnded) {
          expect(names).toContain('raceEnd')
        }
        // The cue belongs to the viewer's turns only.
        const myTurn = added.some((e) => e.kind === 'turnStart' && e.player === 0)
        expect(names.includes('yourTurn')).toBe(myTurn)
        expect(soundsBetween(previous, next, null).map((e) => e.name)).not.toContain('yourTurn')
      }
      expect(launches).toBe(advances)
      expect(isOver(states.at(-1) as MatchState)).not.toBeNull()
    }
  })
})

describe('trackFor', () => {
  it('plays the menu track on menus and a seed-chosen race track in matches', () => {
    for (const kind of ['start', 'builder', 'collection', 'profile', 'online']) {
      expect(trackFor(kind, 7)).toBe(MENU_TRACK)
    }
    const picks = new Set<string>()
    for (let seed = 0; seed < 20; seed++) {
      const track = trackFor('match', seed)
      expect(RACE_TRACKS).toContain(track)
      picks.add(track)
    }
    expect(picks.size).toBe(RACE_TRACKS.length)
    expect(trackFor('onlineMatch', hashText('ABC234'))).toBe(
      trackFor('onlineMatch', hashText('ABC234')),
    )
    expect(hashText('ABC234')).not.toBe(hashText('ABC235'))
  })

  it('plays race music lower than menu music', () => {
    expect(volumeFor(MENU_TRACK)).toBe(MENU_VOLUME)
    for (const track of RACE_TRACKS) expect(volumeFor(track)).toBe(RACE_VOLUME)
    expect(RACE_VOLUME).toBeLessThan(MENU_VOLUME)
  })
})
