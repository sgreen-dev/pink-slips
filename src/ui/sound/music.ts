import { shuffleOrder } from './events.ts'
import { audioContext } from './sfx.ts'

/**
 * The music player (DESIGN.md 8): the six tracks in a shuffled order through the same audio
 * engine as the effects. Within a screen each track plays to its end and the next follows;
 * a change of scene crossfades into the next track, so every screen opens on new music. A
 * chosen track is fetched and decoded ahead of time, which browsers allow before any gesture,
 * so the first tap starts it from memory. A match plays lower than the menus, every effect
 * dips the music for a moment, and the tab going hidden pauses everything.
 */

export const ALL_TRACKS: readonly string[] = [
  'track1',
  'track2',
  'track3',
  'track4',
  'track5',
  'track6',
]

export type Scene = 'menu' | 'race'

/** Levels relative to full scale; effects play above both. */
export const MENU_VOLUME = 0.35
export const RACE_VOLUME = 0.2
/** How far the music dips while an effect plays, and for how long. */
export const DUCK_FACTOR = 0.35
export const DUCK_MS = 700
/** The first start is quick; a change of scene takes a second. */
export const FIRST_FADE_MS = 250
export const FADE_MS = 1000
/** How long before a track ends its successor starts decoding. */
const PREPARE_AHEAD_S = 6

export function volumeFor(scene: Scene): number {
  return scene === 'race' ? RACE_VOLUME : MENU_VOLUME
}

interface Playing {
  track: string
  source: AudioBufferSourceNode
  gain: GainNode
  prepare: ReturnType<typeof setTimeout> | null
}

export class MusicPlayer {
  private readonly base: string
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>()
  private order: string[]
  private cursor = 0
  private scene: Scene | null = null
  private bus: GainNode | null = null
  private playing: Playing | null = null
  private enabled = true
  private unlocked = false
  private starting = 0
  private readonly onVisibility = () => {
    const ctx = audioContext()
    if (!ctx || !this.unlocked) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  }

  constructor(base: string, seed: number) {
    this.base = base
    this.order = shuffleOrder(ALL_TRACKS, seed)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility)
    }
  }

  /** The track the order is on. */
  get current(): string {
    return this.order[this.cursor] ?? ALL_TRACKS[0] ?? ''
  }

  /** The first gesture happened: the decoded track starts now. */
  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (this.enabled && this.scene && !this.playing) void this.start(this.current, FIRST_FADE_MS)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) this.stop(FADE_MS / 4)
    else if (this.unlocked && this.scene && !this.playing) {
      void this.start(this.current, FIRST_FADE_MS)
    }
  }

  /** The scene on screen. The first call prepares the opening track; a change moves on. */
  setScene(scene: Scene): void {
    if (scene === this.scene) return
    const first = this.scene === null
    this.scene = scene
    if (!first) this.advance()
    void this.decode(this.current)
    if (this.unlocked && this.enabled) {
      void this.start(this.current, first || !this.playing ? FIRST_FADE_MS : FADE_MS)
    }
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

  /** Moves the order on, reshuffling at its end without repeating the last track. */
  private advance(): void {
    const last = this.current
    this.cursor += 1
    if (this.cursor >= this.order.length) {
      this.order = shuffleOrder(ALL_TRACKS, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, last)
      this.cursor = 0
    }
  }

  private upcoming(): string {
    return this.order[this.cursor + 1] ?? this.order[0] ?? this.current
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
    // At most the playing track and this one stay decoded; phones have little room.
    const playing = this.playing?.track
    for (const key of this.buffers.keys()) {
      if (key !== track && key !== playing) this.buffers.delete(key)
    }
    return loading
  }

  private async start(track: string, fadeMs: number): Promise<void> {
    const ctx = audioContext()
    if (!ctx) return
    const attempt = ++this.starting
    const buffer = await this.decode(track)
    // The scene may have moved on while decoding; only the latest start goes ahead.
    if (!buffer || attempt !== this.starting || !this.enabled || this.playing?.track === track) {
      return
    }
    if (!this.bus) {
      this.bus = ctx.createGain()
      this.bus.gain.value = 1
      this.bus.connect(ctx.destination)
    }
    this.stop(fadeMs)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(volumeFor(this.scene ?? 'menu'), now + fadeMs / 1000)
    source.connect(gain)
    gain.connect(this.bus)
    source.start(now)
    const playing: Playing = { track, source, gain, prepare: null }
    this.playing = playing
    // Decode the successor shortly before the end, and move on when this one finishes.
    const ahead = Math.max(0, buffer.duration - PREPARE_AHEAD_S) * 1000
    playing.prepare = setTimeout(() => void this.decode(this.upcoming()), ahead)
    source.onended = () => {
      if (this.playing !== playing) return
      this.playing = null
      this.advance()
      if (this.enabled && this.unlocked) void this.start(this.current, FIRST_FADE_MS)
    }
  }

  private stop(fadeMs: number): void {
    const ctx = audioContext()
    const held = this.playing
    this.playing = null
    if (!held) return
    if (held.prepare !== null) clearTimeout(held.prepare)
    held.source.onended = null
    if (!ctx) return
    const now = ctx.currentTime
    held.gain.gain.cancelScheduledValues(now)
    held.gain.gain.setValueAtTime(Math.max(held.gain.gain.value, 0.0001), now)
    held.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000)
    held.source.stop(now + fadeMs / 1000 + 0.05)
  }
}
