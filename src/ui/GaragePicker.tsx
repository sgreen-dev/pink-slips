import type { GarageOption } from './builder.ts'
import { CarCard } from './CarCard.tsx'

interface GaragePickerProps {
  label: string
  options: readonly GarageOption[]
  value: number
  onChange: (index: number) => void
}

/** A radio list of garages: the loaners and any the player saved in the builder. */
export function GaragePicker({ label, options, value, onChange }: GaragePickerProps) {
  return (
    <fieldset className="picker">
      <legend className="picker__legend">{label}</legend>
      {options.map((option, index) => (
        <label
          key={option.id}
          className={`picker__option ${index === value ? 'picker__option--selected' : ''}`}
        >
          <input
            type="radio"
            name={label}
            checked={index === value}
            onChange={() => onChange(index)}
          />
          <span className="picker__title">{option.name}</span>
          <span className="picker__style">{option.style}</span>
          {option.loaner ? (
            <span className="picker__loaner">Loaner. These cars are not in your collection.</span>
          ) : null}
          <span className="picker__cars">
            {option.cars.map((carId) => (
              <CarCard key={carId} carId={carId} size="sm" />
            ))}
          </span>
        </label>
      ))}
    </fieldset>
  )
}
