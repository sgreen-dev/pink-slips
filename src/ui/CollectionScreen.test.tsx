// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { CARS } from '../data/cars.ts'
import { MODS } from '../data/mods.ts'
import { TIER_LABEL } from '../data/tiers.ts'
import { CAR_TYPE_LABEL, TIERS, CAR_TYPES } from '../data/types.ts'
import { CollectionScreen } from './CollectionScreen.tsx'
import { DetailContext } from './detailContext.ts'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The collection screen: the roster, what the player owns, and the filters over it. It is the
 * heaviest screen in the app and the one `P2` and `P4` both changed, and until now nothing but a
 * person clicking had ever checked that it draws the right cards (backlog Q35).
 */

function seed(owned: Record<string, number>, extra: Record<string, unknown> = {}) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned,
      packs: 0,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits: 0,
      ...extra,
    }),
  )
}

const everyCar = () => Object.fromEntries(CARS.map((car) => [car.id, 1]))

/** The cards drawn in the browse grid, by the name printed on each face. */
function shown() {
  const grid = document.querySelector('.browse__grid')
  return [...(grid?.querySelectorAll('.card__name, .mod__name') ?? [])].map((n) => n.textContent)
}

/** As `App` mounts it: the cards only become detail buttons under a provider. */
function open(onBack = vi.fn()) {
  const openDetail = vi.fn()
  const view = draw(
    <DetailContext value={openDetail}>
      <CollectionScreen onBack={onBack} />
    </DetailContext>,
  )
  return { ...view, onBack, openDetail }
}

function tier(name: string) {
  const group = screen.getByRole('group', { name: 'Tier' })
  return [...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!
}

function type(name: string) {
  const group = screen.getByRole('group', { name: 'Type' })
  return [...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)!
}

describe('the collection screen', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('draws the whole roster, and counts what is owned in the tab', () => {
    seed({ 'ford-mustang-gt': 1, 'mazda-rx-7': 2 })
    open()
    expect(shown()).toHaveLength(CARS.length)
    expect(screen.getByRole('button', { name: `Cars (2/${CARS.length})` })).toBeTruthy()
    expect(screen.getByRole('button', { name: `Mods (0/${MODS.length})` })).toBeTruthy()
  })

  it('narrows to a tier, then to a type within it, and back again', () => {
    seed(everyCar())
    open()
    const all = shown().length
    fireEvent.click(tier('Rare'))
    const rare = shown()
    expect(rare.length).toBeGreaterThan(0)
    expect(rare.length).toBeLessThan(all)
    // Every card left must really be Rare. The label is not the id: Rare is the tier `super`.
    const rareTier = TIERS.find((t) => TIER_LABEL[t] === 'Rare')!
    const rareNames = new Set(CARS.filter((c) => c.tier === rareTier).map((c) => c.name))
    expect(rare.length).toBe(rareNames.size)
    for (const name of rare) expect(rareNames.has(name ?? '')).toBe(true)

    fireEvent.click(type('JDM'))
    const both = shown()
    expect(both.length).toBeLessThanOrEqual(rare.length)
    const jdmType = CAR_TYPES.find((t) => CAR_TYPE_LABEL[t] === 'JDM')!
    for (const name of both) {
      const car = CARS.find((c) => c.name === name)
      expect(car?.tier).toBe(rareTier)
      expect(car?.type).toBe(jdmType)
    }

    fireEvent.click(type('All'))
    fireEvent.click(tier('All'))
    expect(shown()).toHaveLength(all)
  })

  it('swaps the grid for the mods, with their own filter', () => {
    seed({ 'turbo-kit': 2 })
    open()
    fireEvent.click(screen.getByRole('button', { name: `Mods (1/${MODS.length})` }))
    expect(shown()).toHaveLength(MODS.length)
    expect(screen.getByRole('group', { name: 'Family' })).toBeTruthy()
    // The car filters belong to the other grid and must be gone with it.
    expect(screen.queryByRole('group', { name: 'Tier' })).toBeNull()
  })

  it('marks a card the player does not own, in words as well as in colour', () => {
    seed({ 'ford-mustang-gt': 1 })
    open()
    expect(screen.getByRole('button', { name: 'Details for Ford Mustang GT' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Details for Mazda RX-7, not owned/ })).toBeTruthy()
  })

  it('shows a count only on a card held more than once', () => {
    seed({ 'ford-mustang-gt': 3, 'mazda-rx-7': 1 })
    const { container } = open()
    const counts = [...container.querySelectorAll('.card__badge')].map((b) => b.textContent)
    expect(counts).toContain('×3')
    expect(counts).not.toContain('×1')
  })

  it('goes back when the header asks it to', () => {
    seed({})
    const { onBack } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
