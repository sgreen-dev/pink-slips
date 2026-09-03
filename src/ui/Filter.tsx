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
      <button
        type="button"
        className={`button button--small ${value === 'all' ? 'button--primary' : ''}`}
        onClick={() => onChange('all')}
      >
        All
      </button>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          className={`button button--small ${value === key ? 'button--primary' : ''}`}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
