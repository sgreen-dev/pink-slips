import { getCar } from '../data/cars.ts'
import { TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'
import { backdropUrl } from './artwork.ts'
import type { RaceEnd } from './celebration.ts'
import { laneNotes } from './explain.ts'

interface RaceTrackProps {
  state: MatchState
  names: readonly [string, string]
  /** Lane order from top to bottom. */
  lanes: readonly [PlayerIndex, PlayerIndex]
  /** A race that just ended: the lanes show its finishing positions instead of the live state. */
  frozen?: RaceEnd | null
}

const MARKS = [0, 330, 660, 990, 1320]

/** Two lanes seen from above. Markers slide toward the finish line at 1320 ft. */
export function RaceTrack({ state, names, lanes, frozen }: RaceTrackProps) {
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
    <div className="track" aria-label="Race track">
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
                <div className="lane__marker" style={{ left: `${(ft / track) * 100}%` }}>
                  <span className="lane__dot" />
                </div>
              )}
            </div>
            <div className="lane__distance">{ft} ft</div>
          </div>
        )
      })}
    </div>
  )
}
