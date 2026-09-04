/**
 * The music player (DESIGN.md 8): one audio element, one track at a time, looping, with a
 * fade on every change. It stays silent until unlocked by a gesture, pauses while the tab is
 * hidden, and sits well under the effects.
 */

export const MENU_TRACK = 'track1'
export const RACE_TRACKS: readonly string[] = ['track2', 'track3', 'track4', 'track5', 'track6']

/** Music level relative to full scale; effects play above it. */
export const MUSIC_VOLUME = 0.35
export const FADE_MS = 1000
const FADE_STEP_MS = 50

export class MusicPlayer {
  private readonly base: string
  private audio: HTMLAudioElement | null = null
  private track: string | null = null
  private enabled = true
  private unlocked = false
  private fade: ReturnType<typeof setInterval> | null = null
  private readonly onVisibility = () => {
    if (!this.audio || !this.unlocked || !this.enabled) return
    if (document.hidden) this.audio.pause()
    else void this.audio.play().catch(() => undefined)
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

  /** The first gesture happened: from now on the chosen track may play. */
  unlock(): void {
    if (this.unlocked) return
    this.unlocked = true
    if (this.enabled && this.track) this.start(this.track)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.stopFade()
      this.audio?.pause()
    } else if (this.unlocked && this.track && !this.audio) {
      this.start(this.track)
    } else if (this.unlocked && this.audio) {
      this.audio.volume = MUSIC_VOLUME
      void this.audio.play().catch(() => undefined)
    }
  }

  /** Changes track with a fade; null fades out. A repeat of the current track does nothing. */
  setTrack(track: string | null): void {
    if (track === this.track) return
    this.track = track
    if (!this.unlocked || !this.enabled) {
      this.audio?.pause()
      this.audio = null
      return
    }
    const old = this.audio
    this.audio = null
    if (old) this.fadeOut(old)
    if (track) this.start(track)
  }

  private start(track: string): void {
    if (typeof Audio === 'undefined') return
    const audio = new Audio(`${this.base}${track}.mp3`)
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = 0
    this.audio = audio
    void audio.play().catch(() => undefined)
    this.fadeIn(audio)
  }

  private fadeIn(audio: HTMLAudioElement): void {
    this.stopFade()
    const steps = FADE_MS / FADE_STEP_MS
    let step = 0
    this.fade = setInterval(() => {
      step += 1
      if (this.audio !== audio) return this.stopFade()
      audio.volume = Math.min(MUSIC_VOLUME, (MUSIC_VOLUME * step) / steps)
      if (step >= steps) this.stopFade()
    }, FADE_STEP_MS)
  }

  private fadeOut(audio: HTMLAudioElement): void {
    const steps = FADE_MS / FADE_STEP_MS
    let step = 0
    const start = audio.volume
    const timer = setInterval(() => {
      step += 1
      audio.volume = Math.max(0, start * (1 - step / steps))
      if (step >= steps) {
        clearInterval(timer)
        audio.pause()
        audio.src = ''
      }
    }, FADE_STEP_MS)
  }

  private stopFade(): void {
    if (this.fade !== null) clearInterval(this.fade)
    this.fade = null
  }
}
