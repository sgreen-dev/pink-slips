import { describe, expect, it } from 'vitest'
import { copyText } from './clipboard.ts'

/**
 * Two screens copy something the player cannot easily retype: the room link and the recovery
 * code, which is shown once. Both need to know whether it landed, since a browser refuses the
 * clipboard outside a user gesture and in an insecure context.
 */
describe('copying to the clipboard', () => {
  it('says so when the text was copied', async () => {
    const written: string[] = []
    expect(await copyText('ABCD-EFGH-JKLM', { writeText: async (t) => void written.push(t) })).toBe(
      true,
    )
    expect(written).toEqual(['ABCD-EFGH-JKLM'])
  })

  it('says so when the browser refuses, rather than throwing at the screen', async () => {
    const refuses = {
      writeText: async () => {
        throw new Error('NotAllowedError')
      },
    }
    expect(await copyText('x', refuses)).toBe(false)
  })

  it('says so when there is no clipboard at all', async () => {
    expect(await copyText('x', undefined)).toBe(false)
  })
})
