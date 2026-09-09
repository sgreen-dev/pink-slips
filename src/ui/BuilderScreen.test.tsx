// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { CARS } from '../data/cars.ts'
import { TUNABLES } from '../engine/index.ts'
import { BuilderScreen } from './BuilderScreen.tsx'
import { DetailContext } from './detailContext.ts'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The deck builder: five cars and thirty mods, and the rules that say when that is a garage
 * (DESIGN.md 9). The counts and the refusals were checked only by a person clicking until now
 * (backlog Q35).
 */

function seed(owned: Record<string, number>) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned,
      packs: 0,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits: 0,
    }),
  )
}

function open(onBack = vi.fn()) {
  const view = draw(
    <DetailContext value={vi.fn()}>
      <BuilderScreen onBack={onBack} />
    </DetailContext>,
  )
  return { ...view, onBack }
}

/** The first car in the browse grid that can actually be added. */
function firstAddableCard(container: HTMLElement) {
  const grid = container.querySelector('.browse__grid')
  return grid?.querySelector('.card-slot button.card') as HTMLElement | undefined
}

describe('the deck builder', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty and says what is missing', () => {
    seed({})
    open()
    expect(screen.getByText(`Garage 0/${TUNABLES.garageSize}`)).toBeTruthy()
    expect(screen.getByText(`Deck 0/${TUNABLES.modDeckSize}`)).toBeTruthy()
    expect(screen.getByText(new RegExp(`Garage has 0 of ${TUNABLES.garageSize} cars`))).toBeTruthy()
    expect(screen.getByText(new RegExp(`Deck has 0 of ${TUNABLES.modDeckSize} cards`))).toBeTruthy()
  })

  it('adds a car to the garage when one is clicked, and counts it', () => {
    seed(Object.fromEntries(CARS.slice(0, 10).map((car) => [car.id, 1])))
    const { container } = open()
    const card = firstAddableCard(container)
    expect(card).toBeTruthy()
    fireEvent.click(card!)
    expect(screen.getByText(`Garage 1/${TUNABLES.garageSize}`)).toBeTruthy()
  })

  it('refuses to save a garage that breaks the rules', () => {
    seed({})
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Save garage' }))
    expect(screen.getByText(/Fix the problems listed before saving/)).toBeTruthy()
  })

  it('swaps the grid between cars and mods', () => {
    seed({})
    open()
    expect(screen.getByRole('group', { name: 'Tier' })).toBeTruthy()
    const tabs = screen.getByRole('group', { name: 'Show' })
    fireEvent.click([...tabs.querySelectorAll('button')][1]!)
    expect(screen.getByRole('group', { name: 'Family' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Tier' })).toBeNull()
  })

  it('marks a card the player does not own', () => {
    seed({ 'ford-mustang-gt': 1 })
    open()
    expect(screen.getAllByText('Not owned').length).toBeGreaterThan(0)
  })

  it('goes back when the header asks it to', () => {
    seed({})
    const { onBack } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
