import { browserStorage, readRecord, writeRecord, type StorageLike } from '../storage.ts'

/** Which sounds the player wants (DESIGN.md 8). Both on unless turned off; remembered. */
export interface SoundSettings {
  music: boolean
  effects: boolean
}

export const SOUND_KEY = 'pink-slips.sound.v1'

export const DEFAULT_SOUND: SoundSettings = { music: true, effects: true }

function isSettings(value: unknown): value is SoundSettings {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record['music'] === 'boolean' && typeof record['effects'] === 'boolean'
}

export function loadSoundSettings(store: StorageLike | null = browserStorage()): SoundSettings {
  return readRecord(SOUND_KEY, isSettings, store) ?? DEFAULT_SOUND
}

export function saveSoundSettings(
  settings: SoundSettings,
  store: StorageLike | null = browserStorage(),
): boolean {
  return writeRecord(SOUND_KEY, settings, store)
}
