import { describe, expect, it } from 'vitest'
import type { StorageLike } from '../storage.ts'
import { DEFAULT_SOUND, loadSoundSettings, saveSoundSettings, SOUND_KEY } from './settings.ts'

function fakeStore(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

describe('sound settings', () => {
  it('default to everything on and round-trip through storage', () => {
    const store = fakeStore()
    expect(loadSoundSettings(store)).toEqual(DEFAULT_SOUND)
    expect(DEFAULT_SOUND).toEqual({ music: true, effects: true })
    expect(saveSoundSettings({ music: false, effects: true }, store)).toBe(true)
    expect(loadSoundSettings(store)).toEqual({ music: false, effects: true })
    store.setItem(SOUND_KEY, '{"music":"yes"}')
    expect(loadSoundSettings(store)).toEqual(DEFAULT_SOUND)
    expect(loadSoundSettings(null)).toEqual(DEFAULT_SOUND)
  })
})
