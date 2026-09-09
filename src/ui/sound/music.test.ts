import { describe, expect, it } from 'vitest'
import { ALL_TRACKS, MusicPlayer } from './music.ts'

/**
 * Most of `music.ts` is a media element and the Web Audio graph, which node has neither of, and
 * stubbing enough of both would test the stub rather than the player. What the order does is
 * already covered where it lives, in `events.test.ts`: `shuffleOrder` never repeats a track back
 * to back, and `volumeFor` puts a match under the menus. What is left to check here is the part
 * that runs before any of that: the player picks a real track to start on, whatever the seed.
 */
describe('the music player', () => {
  it('starts on a real track, for any seed', () => {
    for (const seed of [0, 1, 7, 12345, 4294967295]) {
      const player = new MusicPlayer('/audio/', seed)
      expect(ALL_TRACKS, `seed ${seed}`).toContain(player.currentTrack)
    }
  })

  it('gives a snapshot before anything has played, for the debug readout', () => {
    const snapshot = new MusicPlayer('/audio/', 3).snapshot()
    expect(snapshot).toBeTypeOf('object')
    expect(snapshot).not.toBeNull()
  })
})
