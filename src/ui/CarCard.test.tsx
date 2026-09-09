// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { getCar } from '../data/cars.ts'
import { CarCard } from './CarCard.tsx'
import { DetailContext } from './detailContext.ts'
import { draw, screen } from './testRender.tsx'

/**
 * The card every grid, garage and hand is made of, and the first component with a test at all
 * (backlog Q35). What is pinned here is what the screens depend on: the figures printed on the
 * face, that a card says out loud when it is not owned (backlog A3), and which of the three
 * shapes it takes — a plain card, a clickable one, or one that opens the detail panel.
 */

const MUSTANG = 'ford-mustang-gt'

describe('a car card', () => {
  it('prints the figures the face is meant to carry', () => {
    draw(<CarCard carId={MUSTANG} />)
    const car = getCar(MUSTANG)
    expect(screen.getByText(car.name)).toBeTruthy()
    expect(screen.getByText(String(car.hp))).toBeTruthy()
    expect(screen.getByText(`${car.weightLb.toLocaleString()} lb`)).toBeTruthy()
    expect(screen.getByText(`${car.zeroToSixtySec}s`)).toBeTruthy()
    expect(screen.getByText(`${car.topSpeedMph} mph`)).toBeTruthy()
  })

  it('is a plain card with no button when nothing can be done to it', () => {
    const { container } = draw(<CarCard carId={MUSTANG} />)
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('becomes a button that reports the click when it can be picked', () => {
    const onClick = vi.fn()
    draw(<CarCard carId={MUSTANG} onClick={onClick} />)
    screen.getByRole('button').click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('says in its name that a card is not owned, rather than only fading it', () => {
    // A3: ownership was opacity alone, which is no signal to anyone who cannot see it.
    const open = vi.fn()
    draw(
      <DetailContext value={open}>
        <CarCard carId={MUSTANG} dimmed />
      </DetailContext>,
    )
    expect(screen.getByRole('button', { name: /not owned/ })).toBeTruthy()
  })

  it('opens the detail panel for its own car', () => {
    const open = vi.fn()
    draw(
      <DetailContext value={open}>
        <CarCard carId={MUSTANG} />
      </DetailContext>,
    )
    screen.getByRole('button', { name: /Details for/ }).click()
    expect(open).toHaveBeenCalledWith({ kind: 'car', id: MUSTANG })
  })

  it('keeps the pick and the detail as two separate buttons when it can do both', () => {
    const onClick = vi.fn()
    const open = vi.fn()
    draw(
      <DetailContext value={open}>
        <CarCard carId={MUSTANG} onClick={onClick} />
      </DetailContext>,
    )
    // Nesting one inside the other would make the card unclickable without opening the panel.
    expect(screen.getAllByRole('button')).toHaveLength(2)
    screen.getByRole('button', { name: /Details for/ }).click()
    expect(open).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })
})
