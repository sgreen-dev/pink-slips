import { shuffleOrder } from './events.ts'
import { audioContext } from './sfx.ts'
import { lastGestureAt } from './unlock.ts'

/**
 * The music player (DESIGN.md 8): the six tracks in a shuffled order, each streamed by a
 * media element routed into the same audio engine as the effects. Streaming starts after a
 * fraction of a second is buffered rather than after the whole file, so the first tap is
 * answered at once; routing through the engine keeps the levels and the ducking working on
 * phones, where an element's own volume cannot be set. Within a screen each track plays to
 * its end and the next follows; a change of scene crossfades into the next track.
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
/** The first start only guards against a click; a change of scene takes a second. */
export const FIRST_FADE_MS = 80
export const FADE_MS = 1000

export function volumeFor(scene: Scene): number {
  return scene === 'race' ? RACE_VOLUME : MENU_VOLUME
}

/** One track's element and, once wired, its place in the engine's graph. */
interface Slot {
  track: string
  audio: HTMLAudioElement
  source: MediaElementAudioSourceNode | null
  gain: GainNode | null
  playingAt: number | null
  release: ReturnType<typeof setTimeout> | null
}

export interface MusicSnapshot {
  engine: string
  track: string | null
  readyState: number
  buffered: number
  playing: boolean
  latencyMs: number | null
  enabled: boolean
  unlocked: boolean
}

export class MusicPlayer {
  private readonly base: string
  private order: string[]
  private cursor = 0
  private scene: Scene | null = null
  private bus: GainNode | null = null
  private current: Slot | null = null
  private next: Slot | null = null
  private enabled = true
  private unlocked = false
  private latency: number | null = null
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
  get currentTrack(): string {
    return this.order[this.cursor] ?? ALL_TRACKS[0] ?? ''
  }

  /** The first gesture happened: the buffered track starts now, inside the gesture. */
  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (this.enabled && this.current) this.play(this.current, FIRST_FADE_MS)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      if (this.current) this.fadeOut(this.current, FADE_MS / 4, false)
    } else if (this.unlocked && this.current?.audio.paused) {
      this.play(this.current, FIRST_FADE_MS)
    }
  }

  /** The scene on screen. The first call prepares the opening track; a change moves on. */
  setScene(scene: Scene): void {
    if (scene === this.scene) return
    const first = this.scene === null
    this.scene = scene
    if (first) {
      this.current = this.prepare(this.currentTrack)
    } else {
      this.advance()
      const old = this.current
      this.current = this.takeNext(this.currentTrack)
      if (old) this.fadeOut(old, FADE_MS, true)
    }
    if (this.unlocked && this.enabled && this.current) {
      this.play(this.current, first ? FIRST_FADE_MS : FADE_MS)
    }
  }

  /** Drops the music under an effect and brings it back shortly after. */
  duck(): void {
    const ctx = audioContext()
    if (!ctx || !this.bus || !this.current || this.current.audio.paused) return
    const now = ctx.currentTime
    const gain = this.bus.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(DUCK_FACTOR, now)
    gain.setValueAtTime(DUCK_FACTOR, now + DUCK_MS / 1000)
    gain.linearRampToValueAtTime(1, now + (DUCK_MS + FADE_MS / 2) / 1000)
  }

  snapshot(): MusicSnapshot {
    const audio = this.current?.audio
    let buffered = 0
    if (audio) {
      for (let i = 0; i < audio.buffered.length; i++) {
        buffered += audio.buffered.end(i) - audio.buffered.start(i)
      }
    }
    return {
      engine: audioContext()?.state ?? 'none',
      track: this.current?.track ?? null,
      readyState: audio?.readyState ?? 0,
      buffered,
      playing: !!audio && !audio.paused && !audio.ended,
      latencyMs: this.latency,
      enabled: this.enabled,
      unlocked: this.unlocked,
    }
  }

  /** Moves the order on, reshuffling at its end without repeating the last track. */
  private advance(): void {
    const last = this.currentTrack
    this.cursor += 1
    if (this.cursor >= this.order.length) {
      this.order = shuffleOrder(ALL_TRACKS, (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, last)
      this.cursor = 0
    }
  }

  private upcoming(): string {
    return this.order[this.cursor + 1] ?? this.order[0] ?? this.currentTrack
  }

  /** A buffered element for the track, fetched from now on where the browser allows it. */
  private prepare(track: string): Slot {
    const audio = new Audio(`${this.base}${track}.mp3`)
    audio.preload = 'auto'
    audio.load()
    return { track, audio, source: null, gain: null, playingAt: null, release: null }
  }

  /** The successor slot if it was prepared for this track, otherwise a fresh one. */
  private takeNext(track: string): Slot {
    const held = this.next
    this.next = null
    if (held && held.track === track) return held
    if (held) this.discard(held)
    return this.prepare(track)
  }

  /** Wires the element into the engine once; without an engine the element plays on its own. */
  private wire(slot: Slot): void {
    const ctx = audioContext()
    if (!ctx || slot.source) return
    try {
      if (!this.bus) {
        this.bus = ctx.createGain()
        this.bus.gain.value = 1
        this.bus.connect(ctx.destination)
      }
      slot.source = ctx.createMediaElementSource(slot.audio)
      slot.gain = ctx.createGain()
      slot.gain.gain.value = 0.0001
      slot.source.connect(slot.gain)
      slot.gain.connect(this.bus)
    } catch {
      slot.source = null
      slot.gain = null
    }
  }

  private play(slot: Slot, fadeMs: number): void {
    this.wire(slot)
    const level = volumeFor(this.scene ?? 'menu')
    const ctx = audioContext()
    if (slot.gain && ctx) {
      const now = ctx.currentTime
      slot.gain.gain.cancelScheduledValues(now)
      slot.gain.gain.setValueAtTime(Math.max(slot.gain.gain.value, 0.0001), now)
      if (fadeMs <= FIRST_FADE_MS)
        slot.gain.gain.linearRampToValueAtTime(level, now + fadeMs / 1000)
      else slot.gain.gain.exponentialRampToValueAtTime(level, now + fadeMs / 1000)
    } else {
      slot.audio.volume = level
    }
    if (slot.playingAt === null) {
      slot.audio.addEventListener(
        'playing',
        () => {
          slot.playingAt = performance.now()
          this.latency = slot.playingAt - lastGestureAt()
          // The successor buffers while this one plays, so its start is instant too.
          if (this.current === slot && !this.next) this.next = this.prepare(this.upcoming())
        },
        { once: true },
      )
      slot.audio.addEventListener('ended', () => {
        if (this.current !== slot) return
        this.advance()
        this.current = this.takeNext(this.currentTrack)
        this.discard(slot)
        if (this.enabled && this.unlocked) this.play(this.current, FIRST_FADE_MS)
      })
    }
    void slot.audio.play().catch(() => undefined)
  }

  /** Fades a slot down; then pauses it, and releases it when it is not coming back. */
  private fadeOut(slot: Slot, fadeMs: number, release: boolean): void {
    const ctx = audioContext()
    if (slot.gain && ctx) {
      const now = ctx.currentTime
      slot.gain.gain.cancelScheduledValues(now)
      slot.gain.gain.setValueAtTime(Math.max(slot.gain.gain.value, 0.0001), now)
      slot.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeMs / 1000)
    }
    if (slot.release !== null) clearTimeout(slot.release)
    slot.release = setTimeout(() => {
      slot.release = null
      slot.audio.pause()
      if (release) this.discard(slot)
    }, fadeMs + 50)
  }

  private discard(slot: Slot): void {
    if (slot.release !== null) clearTimeout(slot.release)
    slot.audio.pause()
    slot.source?.disconnect()
    slot.gain?.disconnect()
    slot.audio.removeAttribute('src')
    slot.audio.load()
  }
}
