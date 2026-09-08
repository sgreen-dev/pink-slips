interface PlateProps {
  laps: number
  size?: 'sm' | 'md'
}

/** The lap plate (DESIGN.md 12, Laps): "LAP n" as a small plate. Nothing before the first lap. */
export function Plate({ laps, size = 'sm' }: PlateProps) {
  if (laps < 1) return null
  return (
    <span
      className={`plate plate--${size}`}
      title={`Lap ${laps}: the roster completed ${laps} ${laps === 1 ? 'time' : 'times'}`}
    >
      LAP {laps}
    </span>
  )
}
