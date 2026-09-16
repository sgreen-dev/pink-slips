import { describe, expect, it } from 'vitest'
import { copyText, sendLink } from './clipboard.ts'

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

/**
 * The room link goes to a friend. On a phone that is the share sheet; elsewhere, or when the sheet
 * breaks, it is the clipboard; and when neither works the screen has to be told (backlog U47).
 */
describe('sending a room link', () => {
  const link = { url: 'https://example.test/?room=ABC123', title: 'Pink Slips', text: 'Race me' }
  const refuses = async () => {
    throw new Error('NotAllowedError')
  }
  const aborted = async () => {
    throw Object.assign(new Error('Share canceled'), { name: 'AbortError' })
  }

  it('opens the share sheet when asked for and there is one', async () => {
    const shared: ShareData[] = []
    const copied: string[] = []
    const sender = {
      share: async (data: ShareData) => void shared.push(data),
      clipboard: { writeText: async (t: string) => void copied.push(t) },
    }
    expect(await sendLink(link, true, sender)).toBe('shared')
    expect(shared).toEqual([link])
    expect(copied).toEqual([])
  })

  it('copies instead when share is not asked for, even with a sheet to hand', async () => {
    const copied: string[] = []
    const sender = {
      share: refuses,
      clipboard: { writeText: async (t: string) => void copied.push(t) },
    }
    expect(await sendLink(link, false, sender)).toBe('copied')
    expect(copied).toEqual([link.url])
  })

  it('copies when the browser has no share sheet', async () => {
    const copied: string[] = []
    const sender = { clipboard: { writeText: async (t: string) => void copied.push(t) } }
    expect(await sendLink(link, true, sender)).toBe('copied')
    expect(copied).toEqual([link.url])
  })

  it('treats closing the sheet as a choice, not a failure, and copies nothing', async () => {
    const copied: string[] = []
    const sender = {
      share: aborted,
      clipboard: { writeText: async (t: string) => void copied.push(t) },
    }
    expect(await sendLink(link, true, sender)).toBe('cancelled')
    expect(copied).toEqual([])
  })

  it('falls back to copying when the sheet itself fails', async () => {
    const copied: string[] = []
    const sender = {
      share: refuses,
      clipboard: { writeText: async (t: string) => void copied.push(t) },
    }
    expect(await sendLink(link, true, sender)).toBe('copied')
    expect(copied).toEqual([link.url])
  })

  it('says it failed when neither the sheet nor the clipboard works', async () => {
    expect(await sendLink(link, true, { share: refuses, clipboard: { writeText: refuses } })).toBe(
      'failed',
    )
    expect(await sendLink(link, false, {})).toBe('failed')
    expect(await sendLink(link, true, undefined)).toBe('failed')
  })
})
