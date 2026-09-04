import { useContext, useEffect, useState } from 'react'
import { copiesOwned, packCards, type Pack } from '../collection/collection.ts'
import { loadCollection, type CollectionState } from '../collection/persist.ts'
import { AccountContext, openNext } from './account.ts'
import { PackReveal } from './PackReveal.tsx'

interface PackDialogProps {
  /** Packs this match earned; the headline. */
  earned: number
  /** Called with the packs still waiting when the player closes it. */
  onClose: (remaining: number) => void
}

interface Opened {
  pack: Pack
  fresh: ReadonlySet<string>
}

function noun(n: number): string {
  return n === 1 ? 'pack' : 'packs'
}

/** After a match: how many packs it earned, and the chance to open them right here. */
export function PackDialog({ earned, onClose }: PackDialogProps) {
  const account = useContext(AccountContext)
  const [state, setState] = useState<CollectionState>(() => loadCollection())
  const [opened, setOpened] = useState<Opened | null>(null)
  const remaining = state.packs

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(remaining)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, remaining])

  const open = async () => {
    const result = await openNext(account)
    if (!result) return
    const fresh = new Set(
      packCards(result.pack)
        .filter((card) => copiesOwned(state.owned, card.id) === 0)
        .map((card) => card.id),
    )
    setState(result.state)
    setOpened({ pack: result.pack, fresh })
  }

  return (
    <div className="raceend" role="dialog" aria-modal="true" aria-labelledby="packs-title">
      <div className="raceend__panel raceend__panel--wide">
        <p className="raceend__kicker">Packs</p>
        <h2 id="packs-title" className="raceend__title">
          {earned} {noun(earned)} earned
        </h2>
        {opened ? (
          <PackReveal pack={opened.pack} fresh={opened.fresh} />
        ) : (
          <p className="raceend__line">Open them now, or find them later in the Collection.</p>
        )}
        <p className="raceend__tally">
          {remaining === 0 ? 'All packs opened' : `${remaining} ${noun(remaining)} waiting`}
        </p>
        <div className="packs__actions">
          {remaining > 0 && (
            <button
              type="button"
              className="button button--primary button--big"
              onClick={() => void open()}
              autoFocus
            >
              {opened ? 'Open another' : 'Open a pack'}
            </button>
          )}
          <button
            type="button"
            className={`button button--big ${remaining === 0 ? 'button--primary' : ''}`}
            onClick={() => onClose(remaining)}
            autoFocus={remaining === 0}
          >
            {opened || remaining === 0 ? 'Done' : 'Later'}
          </button>
        </div>
      </div>
    </div>
  )
}
