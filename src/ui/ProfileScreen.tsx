import { useContext, useEffect, useState } from 'react'
import type { LeaderboardRow } from '../server/directory.ts'
import { AccountContext, fetchLeaderboard, fetchMe } from './account.ts'

interface ProfileScreenProps {
  onBack: () => void
}

/** The signed-in player's name, rating, record, and collection, with the leaderboard below. */
export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const account = useContext(AccountContext)
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const endpoint = account?.endpoint ?? null
  const token = account?.token ?? null
  const update = account?.update ?? null

  useEffect(() => {
    if (!endpoint) return
    let live = true
    void fetchLeaderboard(endpoint).then((list) => {
      if (live) setRows(list)
    })
    if (token && update) {
      void fetchMe(endpoint, token).then((me) => {
        if (live && me.data) update(me.data)
      })
    }
    return () => {
      live = false
    }
  }, [endpoint, token, update])

  const profile = account?.data.profile ?? null
  const played = profile ? profile.wins + profile.losses : 0
  return (
    <main className="start profile">
      <header className="builder__header">
        <h1 className="builder__title">{profile ? profile.name : 'Profile'}</h1>
        <button type="button" className="button" onClick={onBack}>
          Back
        </button>
      </header>
      {profile ? (
        <dl className="profile__stats">
          <div>
            <dt>Rating</dt>
            <dd>{profile.rating}</dd>
          </div>
          <div>
            <dt>Record</dt>
            <dd>
              {profile.wins}–{profile.losses}
              {played === 0 ? ' · no ranked matches yet' : ''}
            </dd>
          </div>
          <div>
            <dt>Collection</dt>
            <dd>{profile.cards} cards</dd>
          </div>
          <div>
            <dt>Packs to open</dt>
            <dd>{profile.packs}</dd>
          </div>
        </dl>
      ) : (
        <p className="start__tagline">Sign in to see your rating and record.</p>
      )}
      {account && (
        <p className="online__actions">
          <button type="button" className="button button--ghost" onClick={account.signOut}>
            Sign out
          </button>
        </p>
      )}
      <section className="leaderboard">
        <h2>Leaderboard</h2>
        {rows === null ? (
          <p className="online__status">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="online__status">No ranked matches have been played yet.</p>
        ) : (
          <table className="leaderboard__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Player</th>
                <th>Rating</th>
                <th>Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className={row.id === profile?.id ? 'leaderboard__me' : ''}>
                  <td>{index + 1}</td>
                  <td>{row.name}</td>
                  <td>{row.rating}</td>
                  <td>
                    {row.wins}–{row.losses}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}
