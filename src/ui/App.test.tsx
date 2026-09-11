// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The player dialog over the start screen (backlog A9). It is a modal, and a modal has to take
 * the page out of reach while it is up, or Tab walks off its last control into a page that
 * assistive tech has been told is not there. The dialog exists only with a room service
 * configured, so the address is set before the app is loaded.
 */

describe('the player dialog', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('makes the page inert while it is open, and gives it back when it closes', async () => {
    vi.stubEnv('VITE_ROOM_URL', 'http://127.0.0.1:8787')
    const { App } = await import('./App.tsx')
    draw(<App />)
    const page = document.querySelector('.app__page')
    expect(page?.hasAttribute('inert')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Create a player' }))
    await screen.findByRole('dialog')
    expect(page?.hasAttribute('inert')).toBe(true)
    fireEvent.keyDown(window, { key: 'Escape' })
    const close = screen.queryByRole('button', { name: /close|cancel|not now/i })
    if (close) fireEvent.click(close)
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(page?.hasAttribute('inert')).toBe(false)
  })
})
