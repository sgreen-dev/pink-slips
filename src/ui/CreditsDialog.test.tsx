// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreditsDialog } from './CreditsDialog.tsx'
import { draw, fireEvent, screen } from './testRender.tsx'

/**
 * The credits dialog exists to discharge an obligation — the photographs the card art is made
 * from are shared on terms that ask for the photographer's name — so the test that matters is
 * that opening it actually puts names on the screen, and that a failed request says where the
 * list is instead of showing an empty panel.
 *
 * `HTMLDialogElement.showModal` is not implemented in happy-dom, so it is stubbed. What is being
 * checked is the content, not the browser's modal behaviour.
 */

const TABLE = [
  '| Car id | Car | Photograph | Author | License |',
  '| --- | --- | --- | --- | --- |',
  '| honda-civic-si | Honda Civic Si | [25 Honda Civic Si.jpg](https://commons.wikimedia.org/wiki/File%3A25) | HJUdall | [CC0](http://creativecommons.org/publicdomain/zero/1.0/) |',
].join('\n')

function stubDialog() {
  // Setting `open` is the part that matters, not the modality: a dialog without it is hidden
  // from the accessibility tree, so every role query inside would miss.
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true
  })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the credits dialog', () => {
  it('names the photographer and links the photograph once opened', async () => {
    stubDialog()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(TABLE) })),
    )
    draw(<CreditsDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }))

    expect(await screen.findByText('HJUdall')).toBeTruthy()
    const photo = screen.getByRole('link', { name: '25 Honda Civic Si.jpg' })
    expect(photo.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File%3A25')
    expect(screen.getByRole('link', { name: 'CC0' })).toBeTruthy()
    expect(screen.getByText('Honda Civic Si')).toBeTruthy()
  })

  it('passes the illustrations on under the licence the photographs ask for', () => {
    stubDialog()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    )
    draw(<CreditsDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }))

    const license = screen.getByRole('link', { name: 'CC BY-SA 4.0' })
    expect(license.getAttribute('href')).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
  })

  it('asks for the list once, however many times it is opened', async () => {
    stubDialog()
    const fetcher = vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve(TABLE) }))
    vi.stubGlobal('fetch', fetcher)
    draw(<CreditsDialog />)
    const button = screen.getByRole('button', { name: 'Credits' })
    fireEvent.click(button)
    await screen.findByText('HJUdall')
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('says where the list is when it will not load', async () => {
    stubDialog()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
    )
    draw(<CreditsDialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Credits' }))

    // Derived, not written out: the site is served under a base path, and a hardcoded `/art/...`
    // would keep passing here while 404ing in production.
    const url = `${import.meta.env.BASE_URL}art/CREDITS.md`
    const fallback = await screen.findByRole('link', { name: url })
    expect(fallback.getAttribute('href')).toBe(url)
  })

  it('asks again the next time it is opened, after a request that failed (backlog Q52)', async () => {
    stubDialog()
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
      .mockImplementation(() => Promise.resolve({ ok: true, text: () => Promise.resolve(TABLE) }))
    vi.stubGlobal('fetch', fetcher)
    draw(<CreditsDialog />)
    const button = screen.getByRole('button', { name: 'Credits' })
    fireEvent.click(button)
    await screen.findByRole('link', { name: `${import.meta.env.BASE_URL}art/CREDITS.md` })
    fireEvent.click(button)
    await screen.findByText('HJUdall')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
