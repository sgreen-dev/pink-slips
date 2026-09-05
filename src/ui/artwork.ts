import { CAR_TYPES, type CarType, type ModFamily } from '../data/types.ts'
import { ART_MODS, ART_VERSION, BACKDROPS, FRAMES, ICONS } from './assets.ts'

/**
 * Where each piece of owner artwork lives, or null when the game draws the piece itself
 * (DESIGN.md 8, Owner artwork). Sets that must match across a deck, the type frames, the mod
 * frames, the type icons, and the family icons, show only when every member is present.
 */

const base = import.meta.env.BASE_URL

const url = (folder: string, name: string): string =>
  `${base}${folder}/${name}.webp?v=${ART_VERSION}`

export function modArtUrl(modId: string): string | null {
  return ART_MODS.includes(modId) ? url('art/mods', modId) : null
}

const MOD_FRAMES: readonly string[] = ['mod-part', 'mod-boost', 'mod-sabotage']
const TYPE_FRAMES_READY = CAR_TYPES.every((type) => FRAMES.includes(type))
const MOD_FRAMES_READY = MOD_FRAMES.every((name) => FRAMES.includes(name))

export function typeFrameUrl(type: CarType): string | null {
  return TYPE_FRAMES_READY ? url('frames', type) : null
}

export function familyFrameUrl(family: ModFamily): string | null {
  return MOD_FRAMES_READY ? url('frames', `mod-${family}`) : null
}

export function cardBackUrl(): string | null {
  return FRAMES.includes('back') ? url('frames', 'back') : null
}

export function backdropUrl(name: string): string | null {
  return BACKDROPS.includes(name) ? url('backgrounds', name) : null
}

const TYPE_ICONS_READY = CAR_TYPES.every((type) => ICONS.includes(`type-${type}`))
const FAMILY_ICONS_READY = ['part', 'boost', 'sabotage'].every((f) => ICONS.includes(`family-${f}`))

export function iconUrl(name: string): string | null {
  if (name.startsWith('type-') && !TYPE_ICONS_READY) return null
  if (name.startsWith('family-') && !FAMILY_ICONS_READY) return null
  return ICONS.includes(name) ? url('icons', name) : null
}
