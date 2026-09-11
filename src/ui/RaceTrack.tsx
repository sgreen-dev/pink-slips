import type { CSSProperties, Ref } from 'react'
import { getCar } from '../data/cars.ts'
import { TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'
import { backdropUrl } from './artwork.ts'
import type { RaceEnd } from './celebration.ts'
import { laneNotes } from './explain.ts'
import { useEasedNumber } from './useEasedNumber.ts'

interface RaceTrackProps {
  state: MatchState
  names: readonly [string, string]
  /** Lane order from top to bottom. */
  lanes: readonly [PlayerIndex, PlayerIndex]
  /** A race that just ended: the lanes show its finishing positions instead of the live state. */
  frozen?: RaceEnd | null
  /** The board's handle on the track, for the camera. */
  ref?: Ref<HTMLDivElement>
}

/** Quarter marks along the track, so the labels follow the tunable rather than repeat it. */
const MARKS = [0, 0.25, 0.5, 0.75, 1].map((part) => Math.round(TUNABLES.trackLengthFt * part))

/**
 * The distance beside a lane, counting up in step with the marker rather than snapping.
 * Its own component because `useEasedNumber` is a hook and the lanes are rendered in a map.
 * The lane's `aria-label` carries the real figure, so nothing reads out a value mid-count.
 */
function LaneDistance({ ft }: { ft: number }) {
  const shown = useEasedNumber(ft)
  return (
    <div className="lane__distance">
      <span className="lane__meter">{Math.round(shown)}</span> ft
    </div>
  )
}

/** Two lanes seen from above. Markers slide toward the finish line at 1320 ft. */
export function RaceTrack({ state, names, lanes, frozen, ref }: RaceTrackProps) {
  const track = TUNABLES.trackLengthFt
  const strip = backdropUrl('track')
  const roadStyle = strip
    ? {
        backgroundImage: `url(${strip})`,
        backgroundSize: 'auto 100%',
        backgroundRepeat: 'repeat-x',
      }
    : undefined
  return (
    <div className="track" ref={ref} aria-label="Race track">
      <div className="track__marks">
        {MARKS.map((ft) => (
          <span key={ft} className="track__mark" style={{ left: `${(ft / track) * 100}%` }}>
            {ft}
          </span>
        ))}
      </div>
      {lanes.map((player) => {
        const stagedId = frozen
          ? player === frozen.winner
            ? frozen.winningCarId
            : frozen.capturedCarId
          : state.players[player].stagedCarId
        const car = stagedId ? getCar(stagedId) : null
        const ft = Math.min(
          track,
          frozen ? frozen.distanceFt[player] : state.race.distanceFt[player],
        )
        const notes = frozen ? [] : laneNotes(state, player)
        const won = frozen?.winner === player
        return (
          <div
            key={player}
            className={`lane lane--${car?.type ?? 'empty'}${won ? ' lane--won' : ''}`}
            role="group"
            aria-label={`${names[player]}: ${car ? car.name : 'no car staged'} at ${ft} ft`}
          >
            <div className="lane__label">
              <span className="lane__player">{names[player]}</span>
              <span className="lane__car">{car ? car.name : 'No car staged'}</span>
              {notes.map((note) => (
                <span key={note.text} className={`lane__flag lane__flag--${note.tone}`}>
                  {note.text}
                </span>
              ))}
            </div>
            <div className="lane__road" style={roadStyle}>
              <div className="lane__finish" />
              {car && (
                <div
                  className="lane__marker"
                  // A custom property, so the movement is a transform the compositor owns
                  // rather than a `left` that lays the road out again on every frame.
                  style={{ '--at': `${(ft / track) * 100}%` } as CSSProperties}
                >
                  <span className="lane__dot" />
                </div>
              )}
            </div>
            <LaneDistance ft={ft} />
          </div>
        )
      })}
    </div>
  )
}
