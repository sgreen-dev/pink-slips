import { describe, expect, it } from 'vitest'
import { MODS, getMod } from './mods.ts'
import type { ModEffect } from './types.ts'

function flatten(effects: readonly ModEffect[]): ModEffect[] {
  return effects.flatMap((effect) =>
    effect.kind === 'coinFlip'
      ? [effect, ...flatten(effect.heads), ...flatten(effect.tails)]
      : [effect],
  )
}

describe('mods', () => {
  const parts = MODS.filter((mod) => mod.family === 'part')
  const boosts = MODS.filter((mod) => mod.family === 'boost')
  const sabotage = MODS.filter((mod) => mod.family === 'sabotage')

  it('has the full starting set from the design doc', () => {
    expect(parts).toHaveLength(10)
    expect(boosts).toHaveLength(14)
    expect(sabotage.filter((mod) => mod.kind === 'traction')).toHaveLength(4)
    expect(sabotage.filter((mod) => mod.kind === 'pit')).toHaveLength(4)
    expect(MODS).toHaveLength(32)
  })

  it('keeps roughly three mods that help your own car for every Sabotage', () => {
    // DESIGN.md 2.5: "Boosts outnumber Sabotage roughly three to one." Parts and Boosts both
    // help your own cars, and together they are exactly three per Sabotage in the starting set.
    const ratio = (parts.length + boosts.length) / sabotage.length
    expect(ratio).toBeGreaterThanOrEqual(2.5)
    expect(ratio).toBeLessThanOrEqual(3.5)
  })

  it('gives every mod rules text and at least one effect', () => {
    for (const mod of MODS) {
      expect(mod.text.trim().length, mod.id).toBeGreaterThan(0)
      expect(mod.effects.length, mod.id).toBeGreaterThan(0)
    }
  })

  it('type-locks exactly the three mods the design doc names', () => {
    const locked = Object.fromEntries(
      MODS.filter((mod) => mod.typeLock).map((mod) => [mod.id, mod.typeLock]),
    )
    expect(locked).toEqual({ 'two-step': 'muscle', 'anti-lag': 'jdm', regen: 'ev' })
  })

  it('charges fuel for exactly the Boosts that say so', () => {
    const costly = boosts.filter((mod) => mod.fuelCost).map((mod) => [mod.id, mod.fuelCost])
    expect(costly).toEqual([
      ['nitrous-shot', 1],
      ['fuel-dump', 1],
    ])
  })

  it('keeps Sabotage effects aimed at the opponent and Boost effects at your own car', () => {
    for (const mod of sabotage) {
      for (const effect of flatten(mod.effects)) {
        if ('target' in effect) expect(effect.target, mod.id).toBe('opponent')
      }
    }
    for (const mod of boosts) {
      for (const effect of flatten(mod.effects)) {
        if ('target' in effect) expect(effect.target, mod.id).toBe('self')
      }
    }
  })

  it('uses Traction sabotage for advance reductions and Pit sabotage for car state', () => {
    const advanceKinds = new Set(['reduceDistance', 'halveDistance', 'skipAdvance'])
    for (const mod of sabotage) {
      const kinds = flatten(mod.effects)
        .filter((effect) => effect.kind !== 'coinFlip')
        .map((effect) => effect.kind)
      const touchesAdvance = kinds.some((kind) => advanceKinds.has(kind))
      expect(touchesAdvance, mod.id).toBe(mod.kind === 'traction')
    }
  })

  it('looks mods up by id', () => {
    expect(getMod('turbo-kit').name).toBe('Turbo Kit')
    expect(() => getMod('not-a-mod')).toThrow()
  })
})
