// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLECTION_KEY } from '../collection/persist.ts'
import { PackDialog } from './PackDialog.tsx'
import { draw, fireEvent, screen } from './testRender.tsx'

/** The pop-up that opens the packs a match earned (backlog A10). */

function seed(packs: number) {
  localStorage.setItem(
    COLLECTION_KEY,
    JSON.stringify({
      owned: {},
      packs,
      variants: { foil: {}, holo: {}, chrome: {} },
      laps: 0,
      grantVersion: 2,
      credits: 0,
    }),
  )
}

describe('the pack pop-up', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('hands focus to Done when the last pack is opened', async () => {
    seed(1)
    draw(<PackDialog earned={1} onClose={vi.fn()} />)
    const open = screen.getByRole('button', { name: 'Open a pack' })
    open.focus()
    fireEvent.click(open)
    // Open another goes away under the focus; Done takes it, rather than the page.
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Done'))
  })
})
