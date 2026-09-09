interface FilterProps<T extends string> {
  label: string
  value: T | 'all'
  options: ReadonlyArray<[T, string]>
  onChange: (value: T | 'all') => void
}

/** A row of toggle buttons with an All option, shared by the builder and the collection. */
export function Filter<T extends string>({ label, value, options, onChange }: FilterProps<T>) {
  return (
    <div className="filters" role="group" aria-label={label}>
      <span className="filters__label">{label}</span>
      {/* aria-pressed, as the mode and level toggles carry: which chip is on is otherwise a
          colour, and a colour is no signal to anyone who cannot see it (DESIGN.md 8). */}
      <button
        type="button"
        className={`button button--small ${value === 'all' ? 'button--on' : ''}`}
        aria-pressed={value === 'all'}
        onClick={() => onChange('all')}
      >
        All
      </button>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={`button button--small ${value === key ? 'button--on' : ''}`}
          aria-pressed={value === key}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
