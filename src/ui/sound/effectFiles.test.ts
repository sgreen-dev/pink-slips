import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { EFFECT_FILES } from './effectFiles.ts'
import { isEffectFile } from './sfx.ts'

const FOLDER = fileURLToPath(new URL('../../../public/audio/effects', import.meta.url))

function present(): string[] {
  if (!existsSync(FOLDER)) return []
  return readdirSync(FOLDER)
    .filter((file) => file.endsWith('.mp3'))
    .map((file) => file.replace(/\.mp3$/, ''))
    .sort()
}

describe('owner-made effects', () => {
  it('lists exactly the files present', () => {
    expect([...EFFECT_FILES].sort()).toEqual(present())
  })

  it('names only effects the game plays, each under budget and credited', () => {
    const names = present()
    if (names.length === 0) return
    const credits = readFileSync(join(FOLDER, 'CREDITS.md'), 'utf8')
    for (const name of names) {
      expect(isEffectFile(name), `${name} is not an effect`).toBe(true)
      expect(
        statSync(join(FOLDER, `${name}.mp3`)).size,
        `${name} is over budget`,
      ).toBeLessThanOrEqual(64_000)
      expect(credits, `${name} is not credited`).toContain(`${name}.mp3`)
    }
  })
})
