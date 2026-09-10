import { useRef } from 'react'

/**
 * What the game counts, said plainly, where a player can find it (backlog Q40).
 *
 * It has its own dialog rather than a section in the rules, because the rules carry a word
 * budget that `rules.test.ts` holds them to — under 500 words, so they stay readable — and this
 * would have taken a sixth of it to say nothing about how to play. Same plain-words bar though:
 * short sentences, no legal register, nothing a nine-year-old could not read.
 */

const COUNTED = [
  'A random number saved in this browser. It says you have been here before. It is not your name. Clearing your site data ends it.',
  'Which screens you opened. How many matches you started and finished.',
  'If the game breaks, what went wrong, so it can be fixed.',
]

const NOT_COUNTED = [
  'Your name, or anything you typed.',
  'What cars you own, or who you played against.',
  'Where you are. Your address is never stored.',
]

export function PrivacyDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const close = () => dialogRef.current?.close()
  return (
    <>
      <button
        type="button"
        className="button button--ghost button--small"
        onClick={() => dialogRef.current?.showModal()}
      >
        What this counts
      </button>
      <dialog
        ref={dialogRef}
        className="rules"
        aria-labelledby="privacy-title"
        onClick={(event) => {
          if (event.target === dialogRef.current) close()
        }}
      >
        <div className="rules__body">
          <header className="rules__header">
            <h2 id="privacy-title">What this counts</h2>
            <button type="button" className="button button--small" onClick={close}>
              Close
            </button>
          </header>
          <section>
            <h3 className="rules__title">Counted</h3>
            <p>Only enough to know whether anyone is playing.</p>
            <ul>
              {COUNTED.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="rules__title">Never counted</h3>
            <ul>
              {NOT_COUNTED.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="rules__note">
              Your browser can switch this off. If it asks not to be tracked, nothing is counted and
              nothing is sent.
            </p>
          </section>
        </div>
      </dialog>
    </>
  )
}
