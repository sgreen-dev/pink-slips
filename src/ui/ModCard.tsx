import { VARIANT_LABEL, type Variant } from '../collection/collection.ts'
import type { CSSProperties } from 'react'
import { getMod } from '../data/mods.ts'
import { familyFrameUrl, iconUrl, modArtUrl } from './artwork.ts'
import { useDetail } from './useDetail.ts'
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
  const openDetail = useDetail()
  const art = modArtUrl(modId)
  const frame = familyFrameUrl(mod.family)
  const frameStyle = frame ? ({ '--mod-frame': `url(${frame})` } as CSSProperties) : undefined
  const familyIcon = iconUrl(`family-${mod.family}`)
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
      <div className="mod__family">
        {familyIcon && <img className="mod__icon" src={familyIcon} alt="" />}
        {family}
      </div>
      {art && <img className="mod__art" src={art} alt="" loading="lazy" decoding="async" />}
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
    const card = (
      <button
        type="button"
        className={className}
        style={frameStyle}
        onClick={onClick}
        disabled={!playable}
        aria-pressed={selected}
      >
        {body}
      </button>
    )
    if (!openDetail) return card
    return (
      <div className="card-slot">
        {card}
        <button
          type="button"
          className="mod__info"
          aria-label={`Details for ${mod.name}`}
          onClick={() => openDetail({ kind: 'mod', id: modId })}
        >
          i
        </button>
      </div>
    )
  }
  if (openDetail) {
    return (
      <button
        type="button"
        className={`${className} mod--detail`}
        style={frameStyle}
        aria-label={`Details for ${mod.name}`}
        onClick={() => openDetail({ kind: 'mod', id: modId })}
      >
        {body}
      </button>
    )
  }
  return (
    <div className={className} style={frameStyle}>
      {body}
    </div>
  )
}
