interface HandOverScreenProps {
  name: string
  note: string
  onReveal: () => void
}

/** Shown between turns in hotseat play so hands stay hidden while the device changes hands. */
export function HandOverScreen({ name, note, onReveal }: HandOverScreenProps) {
  return (
    <main className="handover">
      <p className="handover__note">{note}</p>
      <h1 className="handover__title">Pass to {name}</h1>
      <p className="handover__hint">The other player should look away before you continue.</p>
      <button
        type="button"
        className="button button--primary button--big"
        onClick={onReveal}
        autoFocus
      >
        I am {name}, show my hand
      </button>
    </main>
  )
}
