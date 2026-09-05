import { VARIANT_LABEL, type Variant } from '../collection/collection.ts'
import { getMod } from '../data/mods.ts'
import { useVariant } from './variants.ts'

interface ModCardProps {
  modId: string
  playable?: boolean
  selected?: boolean
  onClick?: () => void
  /** Shown faded, such as a card the player does not own yet. */
  dimmed?: boolean
  /** Why the card cannot be played right now, shown on a faded card in the hand. */
  note?: string | null
  size?: 'sm' | 'md'
  /** Foil or holo finish. Without it the card asks the nearest VariantContext. */
  variant?: Variant
}

const FAMILY_LABEL = { part: 'Part', boost: 'Boost', sabotage: 'Sabotage' } as const

export function ModCard({
  modId,
  playable,
  selected,
  onClick,
  dimmed,
  note,
  size = 'md',
  variant: variantProp,
}: ModCardProps) {
  const mod = getMod(modId)
  const variant = useVariant(modId, variantProp)
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
    dimmed ? 'mod--unowned' : '',
    variant === 'base' ? '' : `mod--${variant}`,
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
      {mod.level !== undefined && mod.level > 1 && (
        <div className="mod__level">
          Level {mod.level}
          {mod.upgradeOf ? ` · upgrades ${getMod(mod.upgradeOf).name}` : ''}
        </div>
      )}
      {mod.rarity === 'rare' && <span className="mod__rare">Rare</span>}
      {note && <div className="mod__why">{note}</div>}
      {variant !== 'base' && (
        <span className={`mod__variant mod__variant--${variant}`}>{VARIANT_LABEL[variant]}</span>
      )}
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
