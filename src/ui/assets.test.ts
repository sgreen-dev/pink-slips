import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MODS } from '../data/mods.ts'
import { CAR_TYPES } from '../data/types.ts'
import { ART_MODS, BACKDROPS, FRAMES, ICONS } from './assets.ts'

const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url))
const FAMILIES = ['part', 'boost', 'sabotage']
const ICON_NAMES = [
  ...CAR_TYPES.map((t) => `type-${t}`),
  ...FAMILIES.map((f) => `family-${f}`),
  'fuel',
  'wear',
  'pink-slip',
  'pack',
]

interface Kind {
  folder: string
  listed: readonly string[]
  budget: (name: string) => number
  allowed: (name: string) => boolean
}

const KINDS: Record<string, Kind> = {
  mods: {
    folder: 'art/mods',
    listed: ART_MODS,
    budget: () => 30_000,
    allowed: (name) => MODS.some((mod) => mod.id === name),
  },
  frames: {
    folder: 'frames',
    listed: FRAMES,
    budget: () => 60_000,
    allowed: (name) =>
      CAR_TYPES.includes(name as never) ||
      FAMILIES.some((f) => name === `mod-${f}`) ||
      name === 'back',
  },
  backgrounds: {
    folder: 'backgrounds',
    listed: BACKDROPS,
    budget: (name) => (name === 'track' ? 40_000 : 250_000),
    allowed: (name) =>
      /^start-screen\d*$/.test(name) ||
      ['collection', 'builder', 'online', 'profile', 'result', 'track'].includes(name),
  },
  icons: {
    folder: 'icons',
    listed: ICONS,
    budget: () => 8_000,
    allowed: (name) => ICON_NAMES.includes(name),
  },
}

function present(folder: string): string[] {
  const dir = join(PUBLIC, folder)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((file) => file.endsWith('.webp'))
    .map((file) => file.replace(/\.webp$/, ''))
    .sort()
}

describe('owner artwork', () => {
  it('lists exactly the files present, by kind', () => {
    for (const [kind, spec] of Object.entries(KINDS)) {
      expect([...spec.listed].sort(), kind).toEqual(present(spec.folder))
    }
  })

  it('keeps every file under its budget and within the names the game knows', () => {
    for (const [kind, spec] of Object.entries(KINDS)) {
      for (const name of present(spec.folder)) {
        expect(spec.allowed(name), `${kind}/${name} is not a name the game knows`).toBe(true)
        const size = statSync(join(PUBLIC, spec.folder, `${name}.webp`)).size
        expect(size, `${kind}/${name} is over budget`).toBeLessThanOrEqual(spec.budget(name))
      }
    }
  })

  it('ships matched sets whole or not at all', () => {
    const typeFrames = CAR_TYPES.filter((t) => FRAMES.includes(t)).length
    expect([0, CAR_TYPES.length], 'type frames').toContain(typeFrames)
    const modFrames = FAMILIES.filter((f) => FRAMES.includes(`mod-${f}`)).length
    expect([0, FAMILIES.length], 'mod frames').toContain(modFrames)
    const typeIcons = CAR_TYPES.filter((t) => ICONS.includes(`type-${t}`)).length
    expect([0, CAR_TYPES.length], 'type icons').toContain(typeIcons)
    const familyIcons = FAMILIES.filter((f) => ICONS.includes(`family-${f}`)).length
    expect([0, FAMILIES.length], 'family icons').toContain(familyIcons)
  })

  it('credits every folder that holds files', () => {
    for (const [kind, spec] of Object.entries(KINDS)) {
      const names = present(spec.folder)
      if (names.length === 0) continue
      const credits = join(PUBLIC, spec.folder, 'CREDITS.md')
      expect(existsSync(credits), `${kind} has no credits file`).toBe(true)
      const text = readFileSync(credits, 'utf8')
      for (const name of names)
        expect(text, `${kind}/${name} is not credited`).toContain(`${name}.webp`)
    }
  })
})
