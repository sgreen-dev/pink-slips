import { getMod } from '../data/mods.ts'

interface ModCardProps {
  modId: string
  playable?: boolean
  selected?: boolean
  onClick?: () => void
  size?: 'sm' | 'md'
}

const FAMILY_LABEL = { part: 'Part', boost: 'Boost', sabotage: 'Sabotage' } as const

export function ModCard({ modId, playable, selected, onClick, size = 'md' }: ModCardProps) {
  const mod = getMod(modId)
  const family =
    mod.family === 'sabotage'
      ? `${FAMILY_LABEL.sabotage} · ${mod.kind === 'traction' ? 'Traction' : 'Pit'}`
      : FAMILY_LABEL[mod.family]
  const className = [
    'mod',
    `mod--${mod.family}`,
    `mod--${size}`,
    playable ? 'mod--playable' : '',
    selected ? 'mod--selected' : '',
    onClick && !playable ? 'mod--unplayable' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const body = (
    <>
      <div className="mod__family">{family}</div>
      <div className="mod__name">{mod.name}</div>
      <div className="mod__text">{mod.text}</div>
      {mod.family === 'boost' && mod.fuelCost ? (
        <div className="mod__cost">Costs {mod.fuelCost} fuel</div>
      ) : null}
      {mod.typeLock && <div className="mod__lock">{mod.typeLock.toUpperCase()} only</div>}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        onClick={onClick}
        disabled={!playable}
        aria-pressed={selected}
      >
        {body}
      </button>
    )
  }
  return <div className={className}>{body}</div>
}
