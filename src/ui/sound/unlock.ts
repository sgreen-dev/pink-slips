import { audioContext } from './sfx.ts'

/**
 * Getting phones to play. Browsers refuse audio until a gesture, and iPhones go further: the
 * audio engine stays silent while the ringer switch is on, unless an ordinary media element is
 * playing. So the first gesture resumes the engine and starts a looping silent clip in a media
 * element, which moves the phone into playback mode for as long as the page is open.
 */

let silent: HTMLAudioElement | null = null
let gestureAt = 0

/** When the last gesture reached the unlock, for measuring how soon sound follows it. */
export function lastGestureAt(): number {
  return gestureAt
}

/** A tenth of a second of silence as a WAV data URL, built here so no file is needed. */
function silentClip(): string {
  const rate = 8000
  const samples = rate / 10
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i)
  }
  ascii(0, 'RIFF')
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, 'WAVE')
  ascii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, 'data')
  view.setUint32(40, samples * 2, true)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:audio/wav;base64,${btoa(binary)}`
}

/** True once the engine reports that it is running. */
export function engineRunning(): boolean {
  return audioContext()?.state === 'running'
}

/**
 * Called from a gesture handler. Resumes the engine and starts the silent loop. Safe to call
 * on every gesture: once everything runs it does nothing.
 */
export function unlockOnGesture(): void {
  gestureAt = performance.now()
  const ctx = audioContext()
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined)
  if (typeof Audio === 'undefined') return
  if (!silent) {
    try {
      silent = new Audio(silentClip())
      silent.loop = true
      silent.volume = 0.01
    } catch {
      silent = null
      return
    }
  }
  if (silent.paused) void silent.play().catch(() => undefined)
}

export const GESTURE_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const
