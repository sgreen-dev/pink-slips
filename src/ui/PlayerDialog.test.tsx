// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { PlayerDialog } from './PlayerDialog.tsx'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The recovery code is shown once and is the only way back to a player. When the browser refused
 * the clipboard, Copy stayed Copy, which reads as done (backlog U47).
 */
describe('copying the recovery code', () => {
  function showCode(writeText: (text: string) => Promise<void>): void {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    draw(
      <PlayerDialog
        endpoint="http://127.0.0.1:8787"
        view="code"
        code="ABCD-EFGH-JKLM"
        onSignedIn={vi.fn()}
        onClose={vi.fn()}
      />,
    )
  }

  it('says Copied when the code landed', async () => {
    const copied: string[] = []
    showCode(async (text) => void copied.push(text))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy())
    expect(copied).toEqual(['ABCD-EFGH-JKLM'])
    expect(screen.queryByText(/would not copy/)).toBeNull()
  })

  it('tells the player to write it down when the browser will not copy it', async () => {
    showCode(async () => {
      throw new Error('NotAllowedError')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await vi.waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Write it down'),
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy()
  })
})
