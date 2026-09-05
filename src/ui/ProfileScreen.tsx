import { useContext, useEffect, useState } from 'react'
import { backdropUrl } from './artwork.ts'
import { Backdrop } from './Backdrop.tsx'
import { MAX_NAME_LENGTH } from '../protocol/messages.ts'
import { nameProblem } from '../protocol/names.ts'
import type { LeaderboardRow } from '../server/directory.ts'
import {
  AccountContext,
  fetchLeaderboard,
  fetchMe,
  renamePlayer,
  rotateRecovery,
} from './account.ts'

interface ProfileScreenProps {
  onBack: () => void
  /** Shows a recovery code in the player pop-up. */
  onShowCode: (code: string) => void
}

/**
 * The player's name, rating, record, and collection, with the leaderboard below. The name can
 * be changed, a new recovery code issued, and the player signed out of this browser.
 */
export function ProfileScreen({ onBack, onShowCode }: ProfileScreenProps) {
  const account = useContext(AccountContext)
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null)
  const [name, setName] = useState(account?.data.profile.name ?? '')
  const [busy, setBusy] = useState<'name' | 'code' | null>(null)
  const [confirmOut, setConfirmOut] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
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
  const cleanName = name.trim().slice(0, MAX_NAME_LENGTH)
  const problem = cleanName === '' ? null : nameProblem(cleanName)

  const saveName = async () => {
    if (!account || !cleanName || cleanName === account.data.profile.name || problem) return
    setBusy('name')
    const data = await renamePlayer(account.endpoint, account.token, cleanName)
    setBusy(null)
    if (data === 'refused') {
      setNotice('That name is not allowed here. Try another.')
    } else if (data) {
      account.update(data)
      setNotice(`You are now ${data.profile.name}.`)
    } else {
      setNotice('The service did not answer. Try again in a moment.')
    }
  }

  const newCode = async () => {
    if (!account) return
    setBusy('code')
    const code = await rotateRecovery(account.endpoint, account.token)
    setBusy(null)
    if (code) onShowCode(code)
    else setNotice('The service did not answer. Try again in a moment.')
  }

  return (
    <main className="start profile">
      <Backdrop image={backdropUrl('profile')} />
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
        <p className="start__tagline">Create a player to see your rating and record.</p>
      )}
      {account && (
        <>
          <form
            className="profile__row"
            onSubmit={(event) => {
              event.preventDefault()
              void saveName()
            }}
          >
            <label className="online__field">
              Your name
              <input
                type="text"
                value={name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="button"
              disabled={
                busy !== null ||
                !cleanName ||
                problem !== null ||
                cleanName === account.data.profile.name
              }
            >
              {busy === 'name' ? 'Saving…' : 'Save name'}
            </button>
            {problem && <span className="online__error">{problem}</span>}
          </form>
          <div className="profile__row">
            <button
              type="button"
              className="button"
              disabled={busy !== null}
              onClick={() => void newCode()}
            >
              {busy === 'code' ? 'Making a code…' : 'Show a new recovery code'}
            </button>
            <span className="online__status">
              The code carries this player to another device. A new one retires the old one.
            </span>
          </div>
          <div className="profile__row">
            {confirmOut ? (
              <>
                <span className="online__status">
                  Sign out of this browser? You will need your recovery code to get this player
                  back.
                </span>
                <button type="button" className="button button--primary" onClick={account.signOut}>
                  Sign out
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => setConfirmOut(false)}
                >
                  Stay
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => setConfirmOut(true)}
              >
                Sign out
              </button>
            )}
          </div>
          {notice && (
            <p className="online__status" role="status">
              {notice}
            </p>
          )}
        </>
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
