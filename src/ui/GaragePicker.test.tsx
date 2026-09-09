// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { GaragePicker } from './GaragePicker.tsx'
import type { GarageOption } from './builder.ts'
import { draw, screen } from './testRender.tsx'

/**
 * The picker's rule is an accessibility one and it was got wrong once (backlog A2): five card
 * buttons sat inside the `<label>`, which swallowed all five car names into the radio's own name
 * and put thirty tab stops on the start screen that each toggled the radio they sat in. Nothing
 * pinned it, because no component had a test. This does.
 */

const options: GarageOption[] = [
  {
    id: 'street-kings',
    name: 'Street Kings',
    style: 'cheap tempo, race early and often',
    loaner: true,
    custom: false,
    cars: ['ford-mustang-gt', 'chevrolet-camaro-ss-1le', 'mazda-rx-7'],
    deck: [],
  },
  {
    id: 'exotics',
    name: 'Exotics',
    style: 'fuel the bench, win late with big cars',
    loaner: true,
    custom: false,
    cars: ['ferrari-458-italia'],
    deck: [],
  },
]

function pickerOf(value = 0, onChange = vi.fn()) {
  const view = draw(
    <GaragePicker label="Your garage" options={options} value={value} onChange={onChange} />,
  )
  return { ...view, onChange }
}

describe('the garage picker', () => {
  it('names each radio for its garage alone, not for the cars under it', () => {
    pickerOf()
    const radio = screen.getByRole('radio', { name: /Street Kings/ })
    expect(radio).toBeTruthy()
    // The car names must not have been folded into the radio's accessible name.
    expect(radio.getAttribute('aria-label') ?? '').not.toMatch(/Mustang/)
    const name = radio.closest('label')?.textContent ?? ''
    expect(name).not.toMatch(/Mustang/)
  })

  it('puts no interactive content inside the label', () => {
    const { container } = pickerOf()
    for (const label of container.querySelectorAll('label')) {
      const inside = label.querySelectorAll('button, a[href], select, textarea')
      expect(inside).toHaveLength(0)
      // The radio itself is the one input a label may wrap.
      expect(label.querySelectorAll('input')).toHaveLength(1)
    }
  })

  it('marks the chosen garage and only that one', () => {
    pickerOf(1)
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.checked)).toEqual([false, true])
  })

  it('reports the garage that was chosen by its index', () => {
    const { onChange } = pickerOf(0)
    ;(screen.getByRole('radio', { name: /Exotics/ }) as HTMLInputElement).click()
    expect(onChange).toHaveBeenCalledWith(1)
  })

  it('says a loaner is not in the collection, in words', () => {
    pickerOf()
    expect(screen.getAllByText(/not in your collection/).length).toBeGreaterThan(0)
  })

  it('groups the whole picker under its own label', () => {
    pickerOf()
    expect(screen.getByRole('group', { name: 'Your garage' })).toBeTruthy()
  })
})
