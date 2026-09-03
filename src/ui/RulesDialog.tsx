import type { RefObject } from 'react'
import { rulesSections } from './rules.ts'

interface RulesDialogProps {
  dialogRef: RefObject<HTMLDialogElement | null>
}

/** The rules in a native dialog: Escape closes it, focus stays inside, nothing else moves. */
export function RulesDialog({ dialogRef }: RulesDialogProps) {
  const close = () => dialogRef.current?.close()
  return (
    <dialog
      ref={dialogRef}
      className="rules"
      aria-labelledby="rules-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) close()
      }}
    >
      <div className="rules__body">
        <header className="rules__header">
          <h2 id="rules-title">How to play</h2>
          <button type="button" className="button button--small" onClick={close}>
            Close
          </button>
        </header>
        {rulesSections().map((section) => {
          const items = section.lines.map((line) => <li key={line}>{line}</li>)
          return (
            <section key={section.title}>
              <h3 className="rules__title">{section.title}</h3>
              {section.lead && <p>{section.lead}</p>}
              {section.kind === 'prose' && section.lines.map((line) => <p key={line}>{line}</p>)}
              {section.kind === 'steps' && <ol>{items}</ol>}
              {section.kind === 'bullets' && <ul>{items}</ul>}
              {section.note && <p className="rules__note">{section.note}</p>}
            </section>
          )
        })}
      </div>
    </dialog>
  )
}

interface RulesButtonProps {
  dialogRef: RefObject<HTMLDialogElement | null>
  label?: string
  small?: boolean
}

export function RulesButton({ dialogRef, label = 'How to play', small }: RulesButtonProps) {
  return (
    <button
      type="button"
      className={small ? 'button button--ghost button--small' : 'button button--ghost'}
      onClick={() => dialogRef.current?.showModal()}
    >
      {label}
    </button>
  )
}
