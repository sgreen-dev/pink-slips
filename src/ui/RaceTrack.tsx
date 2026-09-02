import { getCar } from '../data/cars.ts'
import { TUNABLES, type MatchState, type PlayerIndex } from '../engine/index.ts'

interface RaceTrackProps {
  state: MatchState
  names: readonly [string, string]
  /** Lane order from top to bottom. */
  lanes: readonly [PlayerIndex, PlayerIndex]
}

const MARKS = [0, 330, 660, 990, 1320]

/** Two lanes seen from above. Markers slide toward the finish line at 1320 ft. */
export function RaceTrack({ state, names, lanes }: RaceTrackProps) {
  const track = TUNABLES.trackLengthFt
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
        const stagedId = state.players[player].stagedCarId
        const car = stagedId ? getCar(stagedId) : null
        const ft = Math.min(track, state.race.distanceFt[player])
        const pending = state.players[player].pendingSabotage
        const sabotaged = pending.flatReductionFt > 0 || pending.halve || pending.skipAdvance
        return (
          <div key={player} className={`lane lane--${car?.type ?? 'empty'}`}>
            <div className="lane__label">
              <span className="lane__player">{names[player]}</span>
              <span className="lane__car">{car ? car.name : 'No car staged'}</span>
              {sabotaged && <span className="lane__flag">Sabotage pending</span>}
            </div>
            <div className="lane__road">
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
