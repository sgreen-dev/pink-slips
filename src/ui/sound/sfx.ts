/**
 * Sound effects (DESIGN.md 8), all synthesized: no files, no licences, one style. Every
 * effect is a short recipe of oscillators, filtered noise, and gain envelopes on one
 * AudioContext that exists only after the first gesture. Without Web Audio, or before the
 * unlock, every call is a no-op.
 */

export type SoundName =
  | 'stage'
  | 'fuel'
  | 'advance'
  | 'stall'
  | 'boost'
  | 'part'
  | 'sabotage'
  | 'deflect'
  | 'coin'
  | 'raceEnd'
  | 'matchEnd'
  | 'shuffle'
  | 'yourTurn'
  | 'sparkle'
  | 'shimmer'

export const SOUND_NAMES: readonly SoundName[] = [
  'stage',
  'fuel',
  'advance',
  'stall',
  'boost',
  'part',
  'sabotage',
  'deflect',
  'coin',
  'raceEnd',
  'matchEnd',
  'shuffle',
  'yourTurn',
  'sparkle',
  'shimmer',
]

/** Effects sit above the music; the music player keeps its own, lower level. */
const MASTER_GAIN = 0.8

let context: AudioContext | null = null
let master: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

function contextClass(): typeof AudioContext | null {
  const w = globalThis as {
    AudioContext?: typeof AudioContext
    webkitAudioContext?: typeof AudioContext
  }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Creates the context on a user gesture. True when audio is available. */
export function unlockEffects(): boolean {
  const Ctor = contextClass()
  if (!Ctor) return false
  if (!context) {
    try {
      context = new Ctor()
      master = context.createGain()
      master.gain.value = MASTER_GAIN
      master.connect(context.destination)
    } catch {
      context = null
      return false
    }
  }
  if (context.state === 'suspended') void context.resume()
  return true
}

export function effectsReady(): boolean {
  return context !== null
}

function noise(): AudioBuffer {
  if (!context) throw new Error('No audio context')
  if (noiseBuffer) return noiseBuffer
  const length = context.sampleRate
  noiseBuffer = context.createBuffer(1, length, context.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  let seed = 0x2545f491
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = (seed / 0xffffffff) * 2 - 1
  }
  return noiseBuffer
}

interface Tone {
  from: number
  to?: number
  type?: OscillatorType
  at?: number
  duration: number
  gain: number
  attack?: number
}

interface Burst {
  at?: number
  duration: number
  gain: number
  filter?: { type: BiquadFilterType; from: number; to?: number }
  attack?: number
}

function tone(spec: Tone): void {
  if (!context || !master) return
  const start = context.currentTime + (spec.at ?? 0)
  const osc = context.createOscillator()
  osc.type = spec.type ?? 'sine'
  osc.frequency.setValueAtTime(spec.from, start)
  if (spec.to !== undefined)
    osc.frequency.exponentialRampToValueAtTime(spec.to, start + spec.duration)
  const env = context.createGain()
  const attack = spec.attack ?? 0.005
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(spec.gain, start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration)
  osc.connect(env)
  env.connect(master)
  osc.start(start)
  osc.stop(start + spec.duration + 0.02)
}

function burst(spec: Burst): void {
  if (!context || !master) return
  const start = context.currentTime + (spec.at ?? 0)
  const source = context.createBufferSource()
  source.buffer = noise()
  source.loop = true
  const env = context.createGain()
  const attack = spec.attack ?? 0.005
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(spec.gain, start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + spec.duration)
  let head: AudioNode = source
  if (spec.filter) {
    const filter = context.createBiquadFilter()
    filter.type = spec.filter.type
    filter.frequency.setValueAtTime(spec.filter.from, start)
    if (spec.filter.to !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(spec.filter.to, start + spec.duration)
    }
    filter.Q.value = 1.2
    source.connect(filter)
    head = filter
  }
  head.connect(env)
  env.connect(master)
  source.start(start)
  source.stop(start + spec.duration + 0.02)
}

const NOTE = { g4: 392, c5: 523.25, e5: 659.25, g5: 783.99, c6: 1046.5 }

/** Plays one effect. `intensity` from 0 to 1 scales the launch; other sounds ignore it. */
export function playEffect(name: SoundName, intensity = 1): void {
  if (!context || !master) return
  const level = Math.min(1, Math.max(0, intensity))
  switch (name) {
    case 'stage':
      tone({ from: 90, to: 55, duration: 0.2, gain: 0.5 })
      burst({ duration: 0.03, gain: 0.25, filter: { type: 'highpass', from: 2500 } })
      return
    case 'fuel':
      burst({ duration: 0.07, gain: 0.25, filter: { type: 'bandpass', from: 1800 } })
      tone({ from: 700, to: 500, duration: 0.06, gain: 0.12 })
      return
    case 'advance': {
      const duration = 0.45 + 0.7 * level
      tone({ from: 70, to: 260 + 420 * level, type: 'sawtooth', duration, gain: 0.3, attack: 0.03 })
      burst({
        duration: duration * 0.8,
        gain: 0.18,
        filter: { type: 'bandpass', from: 400, to: 1400 },
        attack: 0.05,
      })
      return
    }
    case 'stall':
      tone({ from: 130, to: 90, type: 'square', duration: 0.08, gain: 0.18 })
      tone({ from: 130, to: 80, type: 'square', duration: 0.1, gain: 0.18, at: 0.16 })
      return
    case 'boost':
      burst({
        duration: 0.45,
        gain: 0.28,
        filter: { type: 'bandpass', from: 400, to: 3200 },
        attack: 0.04,
      })
      tone({ from: 300, to: 900, duration: 0.4, gain: 0.12 })
      return
    case 'part':
      tone({ from: 1200, duration: 0.12, gain: 0.22 })
      tone({ from: 1810, duration: 0.09, gain: 0.14 })
      tone({ from: 2400, duration: 0.06, gain: 0.08 })
      return
    case 'sabotage':
      tone({ from: 420, to: 110, type: 'square', duration: 0.4, gain: 0.2, attack: 0.02 })
      tone({ from: 430, to: 115, type: 'square', duration: 0.4, gain: 0.1, attack: 0.02 })
      return
    case 'deflect':
      tone({ from: 1400, to: 2100, duration: 0.12, gain: 0.18 })
      return
    case 'coin': {
      for (let i = 0; i < 6; i++) {
        burst({
          at: i * 0.07 + i * i * 0.01,
          duration: 0.02,
          gain: 0.2,
          filter: { type: 'highpass', from: 3000 },
        })
      }
      tone({ from: 1568, duration: 0.35, gain: 0.2, at: 0.55 })
      tone({ from: 2093, duration: 0.3, gain: 0.1, at: 0.58 })
      return
    }
    case 'raceEnd':
      tone({ from: NOTE.c5, duration: 0.18, gain: 0.22 })
      tone({ from: NOTE.e5, duration: 0.18, gain: 0.22, at: 0.14 })
      tone({ from: NOTE.g5, duration: 0.45, gain: 0.24, at: 0.28 })
      burst({
        duration: 0.7,
        gain: 0.14,
        filter: { type: 'lowpass', from: 900, to: 3000 },
        attack: 0.25,
      })
      return
    case 'matchEnd':
      tone({ from: NOTE.g4, type: 'triangle', duration: 0.16, gain: 0.24 })
      tone({ from: NOTE.c5, type: 'triangle', duration: 0.16, gain: 0.24, at: 0.15 })
      tone({ from: NOTE.e5, type: 'triangle', duration: 0.16, gain: 0.24, at: 0.3 })
      tone({ from: NOTE.g5, type: 'triangle', duration: 0.16, gain: 0.24, at: 0.45 })
      tone({ from: NOTE.c6, type: 'triangle', duration: 0.8, gain: 0.26, at: 0.6 })
      tone({ from: NOTE.e5, type: 'triangle', duration: 0.8, gain: 0.14, at: 0.6 })
      burst({
        duration: 1,
        gain: 0.12,
        filter: { type: 'lowpass', from: 800, to: 4000 },
        attack: 0.4,
      })
      return
    case 'shuffle':
      for (let i = 0; i < 4; i++) {
        burst({
          at: i * 0.055,
          duration: 0.03,
          gain: 0.14,
          filter: { type: 'highpass', from: 2000 },
        })
      }
      return
    case 'yourTurn':
      tone({ from: 880, duration: 0.09, gain: 0.12 })
      tone({ from: 1108, duration: 0.14, gain: 0.12, at: 0.1 })
      return
    case 'sparkle':
      for (let i = 0; i < 5; i++) {
        tone({
          from: 1200 * 1.25 ** i,
          type: 'triangle',
          duration: 0.08,
          gain: 0.14,
          at: i * 0.045,
        })
      }
      return
    case 'shimmer':
      tone({ from: 2500, to: 4200, duration: 0.6, gain: 0.1, attack: 0.1 })
      tone({ from: 3300, to: 3330, duration: 0.7, gain: 0.08, attack: 0.15 })
      tone({ from: NOTE.c6, type: 'triangle', duration: 0.5, gain: 0.1, at: 0.2 })
      return
  }
}
