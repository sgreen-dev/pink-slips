import { useRef, useState } from 'react'
import { ART_LICENSE, parseCredits, type Credit } from './credits.ts'

/**
 * Where the card art came from, inside the game rather than in a file beside it.
 *
 * Most of the illustrations are cut and restyled from photographs on Wikimedia Commons, and those
 * photographs are shared on terms that ask for the photographer's name and for the same freedom to
 * be passed on. `public/art/CREDITS.md` has carried that list for a while, but nothing linked to
 * it, and a credit nobody can reach is not much of a credit. So the list is loaded and shown here.
 *
 * It is fetched when the dialog first opens rather than bundled: a hundred and twenty-odd rows are
 * worth a request only from the player who asks for them, and the file is already published and
 * already the thing the art tool writes. Kept after the first open, so reopening is free.
 */

/** The published list. Base-prefixed like every other asset: the site is served under a path. */
const CREDITS_URL = `${import.meta.env.BASE_URL}art/CREDITS.md`

type State =
  { status: 'idle' | 'loading' } | { status: 'ready'; credits: Credit[] } | { status: 'failed' }

export function CreditsDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<State>({ status: 'idle' })
  const close = () => dialogRef.current?.close()

  const open = () => {
    dialogRef.current?.showModal()
    // A list that loaded, or is loading, is not asked for again. One that failed is, so a dropped
    // connection on the first open does not cost the list for the rest of the session (Q52).
    if (state.status === 'loading' || state.status === 'ready') return
    setState({ status: 'loading' })
    void fetch(CREDITS_URL)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.text()
      })
      .then((text) => setState({ status: 'ready', credits: parseCredits(text) }))
      .catch(() => setState({ status: 'failed' }))
  }

  return (
    <>
      <button type="button" className="button button--ghost button--small" onClick={open}>
        Credits
      </button>
      <dialog
        ref={dialogRef}
        className="rules credits"
        aria-labelledby="credits-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) close()
        }}
      >
        <div className="rules__body">
          <header className="rules__header">
            <h2 id="credits-title">Where the art comes from</h2>
            <button type="button" className="button button--small" onClick={close}>
              Close
            </button>
          </header>
          <section>
            <p>
              Every car is a real car, and most of the illustrations started as a photograph someone
              else took and shared. Each one was cut out of its background and redrawn in the card
              style. The photographers are listed below, with the photograph and the terms they
              shared it on.
            </p>
            <p>
              Those illustrations are passed on under{' '}
              <a href={ART_LICENSE.url} target="_blank" rel="noreferrer noopener">
                {ART_LICENSE.name}
              </a>
              , which means you may use them yourself, including to make money, so long as you
              credit the photographer and leave the next person the same freedom.
            </p>
            <p className="rules__note">
              The music, the backgrounds, the card frames, the icons and the mod illustrations are
              the owner&rsquo;s own work.
            </p>
          </section>
          <section>
            <h3 className="rules__title">The photographs</h3>
            {state.status === 'ready' ? (
              <div className="credits__scroll">
                <table className="credits__table">
                  <thead>
                    <tr>
                      <th scope="col">Car</th>
                      <th scope="col">Photograph</th>
                      <th scope="col">By</th>
                      <th scope="col">Terms</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.credits.map((credit) => (
                      <tr key={credit.carId}>
                        <td>{credit.car}</td>
                        <td>
                          <a href={credit.photoUrl} target="_blank" rel="noreferrer noopener">
                            {credit.photo}
                          </a>
                        </td>
                        <td>{credit.author}</td>
                        <td>
                          {credit.licenseUrl === '' ? (
                            credit.license
                          ) : (
                            <a href={credit.licenseUrl} target="_blank" rel="noreferrer noopener">
                              {credit.license}
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : state.status === 'failed' ? (
              <p className="rules__note">
                The list would not load. It is also published at{' '}
                <a href={CREDITS_URL} target="_blank" rel="noreferrer noopener">
                  {CREDITS_URL}
                </a>
                .
              </p>
            ) : (
              <p className="rules__note">Loading the list&hellip;</p>
            )}
          </section>
        </div>
      </dialog>
    </>
  )
}
