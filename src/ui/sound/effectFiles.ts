/**
 * Owner-made effects present under public/audio/effects, written by
 * scripts/audio/encode_effects.py after every encode; do not edit by hand. An effect that is
 * not listed is synthesized by the game (DESIGN.md 8, Sound).
 */
export const EFFECT_FILES: readonly string[] = [
  'advance',
  'advance-ev',
  'advance-jdm',
  'advance-luxury',
  'advance-muscle',
  'advance-offroad',
  'advance-sports',
  'boost',
  'coin',
  'deflect',
  'fuel',
  'matchEnd',
  'part',
  'raceEnd',
  'sabotage',
  'shimmer',
  'shuffle',
  'sparkle',
  'stage',
  'stall',
  'yourTurn',
]
/** Bumped by every encode, so browsers fetch changed files under the same names. */
export const EFFECTS_VERSION = '20260907031244'
