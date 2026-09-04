import { audioContext } from './sfx.ts'

/**
 * The music player (DESIGN.md 8): one track at a time, looping, through the same audio
 * engine as the effects. A chosen track is fetched and decoded at once, which browsers allow
 * before any gesture, so the first tap starts it from memory with no wait. Changes crossfade,
 * the tab going hidden pauses everything, a match plays lower than the menus, and every
 * effect dips the music for a moment.
 */

export const MENU_TRACK = 'track1'
export const RACE_TRACKS: readonly string[] = ['track2', 'track3', 'track4', 'track5', 'track6']

/** Levels relative to full scale; effects play above both. */
export const MENU_VOLUME = 0.35
export const RACE_VOLUME = 0.2
/** How far the music dips while an effect plays, and for how long. */
export const DUCK_FACTOR = 0.35
export const DUCK_MS = 700
/** The first start is quick; a change of track takes a second. */
export const FIRST_FADE_MS = 250
export const FADE_MS = 1000

export function volumeFor(track: string): number {
  return RACE_TRACKS.includes(track) ? RACE_VOLUME : MENU_VOLUME
}

interface Playing {
  track: string
  source: AudioBufferSourceNode
  gain: GainNode
}

export class MusicPlayer {
  private readonly base: string
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>()
  private bus: GainNode | null = null
  private playing: Playing | null = null
  private track: string | null = null
  private enabled = true
  private unlocked = false
  private readonly onVisibility = () => {
    const ctx = audioContext()
    if (!ctx || !this.unlocked) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  }

  constructor(base: string) {
    this.base = base
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility)
    }
  }

  get current(): string | null {
    return this.track
  }

  /** The first gesture happened: the decoded track starts now. */
  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (this.enabled && this.track && !this.playing) void this.start(this.track, FIRST_FADE_MS)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.stop(FADE_MS / 4)
    else if (this.unlocked && this.track && !this.playing)
      void this.start(this.track, FIRST_FADE_MS)
  }

  /** Chooses the track: decoding starts at once, playing when allowed. Null fades out. */
  setTrack(track: string | null): void {
    if (track === this.track) return
    this.track = track
    if (!track) {
      this.stop(FADE_MS)
      return
    }
    void this.decode(track)
    if (this.unlocked && this.enabled)
      void this.start(track, this.playing ? FADE_MS : FIRST_FADE_MS)
  }

  /** Drops the music under an effect and brings it back shortly after. */
  duck(): void {
    const ctx = audioContext()
    if (!ctx || !this.bus || !this.playing) return
    const now = ctx.currentTime
    const gain = this.bus.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(DUCK_FACTOR, now)
    gain.setValueAtTime(DUCK_FACTOR, now + DUCK_MS / 1000)
    gain.linearRampToValueAtTime(1, now + (DUCK_MS + FADE_MS / 2) / 1000)
  }

  private decode(track: string): Promise<AudioBuffer | null> {
    const held = this.buffers.get(track)
    if (held) return held
    const ctx = audioContext()
    const loading = (async () => {
      if (!ctx || typeof fetch !== 'function') return null
      try {
        const response = await fetch(`${this.base}${track}.mp3`)
        if (!response.ok) return null
        return await ctx.decodeAudioData(await response.arrayBuffer())
      } catch {
        return null
      }
    })()
    this.buffers.set(track, loading)
    // Keep the menu track and the one in use; drop the rest so phones stay comfortable.
    for (const key of this.buffers.keys()) {
      if (key !== MENU_TRACK && key !== track) this.buffers.delete(key)
    }
    return loading
  }

  private async start(track: string, fadeMs: number): Promise<void> {
    const ctx = audioContext()
    if (!ctx) return
    const buffer = await this.decode(track)
    // The choice may have moved on while decoding.
    if (!buffer || this.track !== track || !this.enabled || this.playing?.track === track) return
    if (!this.bus) {
      this.bus = ctx.createGain()
      this.bus.gain.value = 1
      this.bus.connect(ctx.destination)
    }
    this.stop(fadeMs)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volumeFor(track), now + fadeMs / 1000)
    source.connect(gain)
    gain.connect(this.bus)
    source.start(now)
    this.playing = { track, source, gain }
  }

  private stop(fadeMs: number): void {
    const ctx = audioContext()
    const held = this.playing
    this.playing = null
    if (!ctx || !held) return
    const now = ctx.currentTime
    held.gain.gain.cancelScheduledValues(now)
    held.gain.gain.setValueAtTime(Math.max(held.gain.gain.value, 0.0001), now)
    held.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000)
    held.source.stop(now + fadeMs / 1000 + 0.05)
  }
}
