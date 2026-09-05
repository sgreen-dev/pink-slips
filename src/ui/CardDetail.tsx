import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { CarCard } from './CarCard.tsx'
import { carDetailRows, modDetailRows } from './detail.ts'
import { DetailContext, type DetailTarget } from './detailContext.ts'
import { ModCard } from './ModCard.tsx'

/**
 * The card detail panel (DESIGN.md 8, Card detail): one native dialog for the whole app that
 * any card can open. Cards ask the context for the opener; without a provider they render as
 * they always did.
 */

export function DetailProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [target, setTarget] = useState<DetailTarget | null>(null)
  useEffect(() => {
    const dialog = dialogRef.current
    if (target && dialog && !dialog.open) dialog.showModal()
  }, [target])
  return (
    <DetailContext value={setTarget}>
      {children}
      <CardDetail dialogRef={dialogRef} target={target} onClosed={() => setTarget(null)} />
    </DetailContext>
  )
}

interface CardDetailProps {
  dialogRef: RefObject<HTMLDialogElement | null>
  target: DetailTarget | null
  onClosed: () => void
}

function CardDetail({ dialogRef, target, onClosed }: CardDetailProps) {
  const close = () => dialogRef.current?.close()
  const title = target
    ? target.kind === 'car'
      ? getCar(target.id).name
      : getMod(target.id).name
    : ''
  const rows = target
    ? target.kind === 'car'
      ? carDetailRows(target.id)
      : modDetailRows(target.id)
    : []
  return (
    <dialog
      ref={dialogRef}
      className="detail"
      aria-labelledby="detail-title"
      onClose={onClosed}
      onClick={(event) => {
        if (event.target === dialogRef.current) close()
      }}
    >
      <DetailContext value={null}>
        {target && (
          <div className="detail__body">
            <header className="detail__header">
              <h2 id="detail-title">{title}</h2>
              <button type="button" className="button button--small" onClick={close}>
                Close
              </button>
            </header>
            <div className="detail__layout">
              <div className="detail__card">
                {target.kind === 'car' ? (
                  <CarCard carId={target.id} size="lg" />
                ) : (
                  <ModCard modId={target.id} />
                )}
              </div>
              <dl className="detail__rows">
                {rows.map((row) => (
                  <div key={row.label} className="detail__row">
                    <dt>{row.label}</dt>
                    <dd className={row.label === 'Source' ? 'detail__source' : undefined}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        )}
      </DetailContext>
    </dialog>
  )
}
