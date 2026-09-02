import { describe, expect, it } from 'vitest'
import { CARS } from './cars.ts'
import { MODS } from './mods.ts'

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('card catalog', () => {
  it('has unique ids across cars and mods', () => {
    const ids = [...CARS.map((car) => car.id), ...MODS.map((mod) => mod.id)]
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index)
    expect(duplicates).toEqual([])
  })

  it('uses kebab-case ids', () => {
    const bad = [...CARS, ...MODS].map((card) => card.id).filter((id) => !KEBAB_CASE.test(id))
    expect(bad).toEqual([])
  })
})
