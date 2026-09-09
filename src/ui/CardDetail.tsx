import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { getCar } from '../data/cars.ts'
import type { CarDetail } from '../data/types.ts'
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

type Details = Readonly<Record<string, CarDetail>>

/**
 * The printed detail for every car is a fifth of the roster by size and only this panel reads
 * it, so it is fetched once the app is up rather than before the start screen paints
 * (backlog P3). Kept at module scope so a second provider does not fetch it again.
 */
let loaded: Details | null = null
let loading: Promise<Details> | null = null
function loadDetails(): Promise<Details> {
  loading ??= import('../data/carDetails.ts').then((module) => {
    loaded = module.CAR_DETAILS
    return loaded
  })
  return loading
}

export function DetailProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const [target, setTarget] = useState<DetailTarget | null>(null)
  const [details, setDetails] = useState<Details | null>(loaded)
  useEffect(() => {
    const dialog = dialogRef.current
    if (target && dialog && !dialog.open) dialog.showModal()
  }, [target])
  // After the first paint, so the bytes are off the critical path but there long before a card
  // is clicked. A panel opened before it lands simply shows the rows that do not need it.
  useEffect(() => {
    if (!details) void loadDetails().then(setDetails)
  }, [details])
  return (
    <DetailContext value={setTarget}>
      {children}
      <CardDetail
        dialogRef={dialogRef}
        target={target}
        details={details}
        onClosed={() => setTarget(null)}
      />
    </DetailContext>
  )
}

interface CardDetailProps {
  dialogRef: RefObject<HTMLDialogElement | null>
  target: DetailTarget | null
  details: Details | null
  onClosed: () => void
}

function CardDetail({ dialogRef, target, details, onClosed }: CardDetailProps) {
  const close = () => dialogRef.current?.close()
  const title = target
    ? target.kind === 'car'
      ? getCar(target.id).name
      : getMod(target.id).name
    : ''
  const rows = target
    ? target.kind === 'car'
      ? carDetailRows(target.id, details?.[target.id])
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
