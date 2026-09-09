import { counterEndpoint } from './counter.ts'

/**
 * Sending a crash somewhere it can be read (backlog Q38). The boundary logged to the console,
 * which nobody but the player ever sees, so a game that broke for someone else was invisible.
 *
 * What goes: the message, the stack, and the commit the build came from. What never goes: a
 * player's name, their collection, a room code, or anything else that identifies them. It is
 * fire and forget — a failed report must never turn one crash into two, and the game never
 * waits on it.
 */

declare const __COMMIT__: string

/** The commit this build came from, or 'unknown' outside a build. */
export function buildCommit(): string {
  return typeof __COMMIT__ === 'string' ? __COMMIT__ : 'unknown'
}

export function reportCrash(
  error: unknown,
  extra = '',
  endpoint: string | null = counterEndpoint(),
  fetcher: typeof fetch | undefined = typeof fetch === 'function' ? fetch : undefined,
): void {
  if (!endpoint || !fetcher) return
  const message = error instanceof Error ? error.message : String(error)
  const stack = [error instanceof Error ? (error.stack ?? '') : '', extra]
    .filter((part) => part !== '')
    .join('\n')
  try {
    void fetcher(`${endpoint.replace(/\/+$/, '')}/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack, commit: buildCommit() }),
    }).catch(() => undefined)
  } catch {
    // A blocked or missing fetch is not worth a second failure.
  }
}
