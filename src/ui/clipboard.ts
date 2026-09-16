/**
 * Copying to the clipboard, which two screens need: the room link and the recovery code. The
 * browser refuses it outside a user gesture and in an insecure context, so the caller is told
 * whether it landed rather than being left to assume.
 */
export async function copyText(
  text: string,
  target: Pick<Clipboard, 'writeText'> | undefined = globalThis.navigator?.clipboard,
): Promise<boolean> {
  if (!target) return false
  try {
    await target.writeText(text)
    return true
  } catch {
    return false
  }
}

/** What happened to a room link the player asked to send. */
export type Sent = 'shared' | 'copied' | 'cancelled' | 'failed'

/** The two parts of `navigator` that sending a link uses, so tests can pass a fake. */
export interface Sender {
  share?: (data: ShareData) => Promise<void>
  clipboard?: Pick<Clipboard, 'writeText'>
}

/**
 * Sends a room link (backlog U47). On a phone the share sheet is how a link reaches a friend, so
 * it opens when `share` is asked for and the browser has one; closing the sheet is the player's
 * choice and says nothing. Anywhere else, or when the sheet itself fails, the link is copied, and
 * `failed` means neither worked, so the screen can say so instead of leaving the button unchanged.
 */
export async function sendLink(
  data: { url: string; title: string; text: string },
  share: boolean,
  sender: Sender | undefined = globalThis.navigator,
): Promise<Sent> {
  if (share && sender?.share) {
    try {
      await sender.share(data)
      return 'shared'
    } catch (error) {
      // A DOMException; read by name, since not every engine makes it an instance of Error.
      if (typeof error === 'object' && error !== null && 'name' in error) {
        if (error.name === 'AbortError') return 'cancelled'
      }
    }
  }
  return (await copyText(data.url, sender?.clipboard)) ? 'copied' : 'failed'
}
