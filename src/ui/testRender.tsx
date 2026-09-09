// @vitest-environment happy-dom
import { afterEach } from 'vitest'
import { cleanup, render, type RenderOptions } from '@testing-library/react'
import type { ReactElement } from 'react'

/**
 * Rendering a component in a test (backlog Q35). The suite runs in `node` by default, since the
 * engine, the CPU and the service never touch a DOM and are faster without one; a test that
 * needs a screen opts in with `// @vitest-environment happy-dom` at the top of its file and
 * renders through here.
 *
 * Importing this registers the cleanup, so a test never leaves its markup behind for the next.
 */

afterEach(cleanup)

export function draw(ui: ReactElement, options?: RenderOptions) {
  return render(ui, options)
}

export { screen, within, fireEvent, act } from '@testing-library/react'
