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
