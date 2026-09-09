import { isRoomCode } from '../protocol/messages.ts'

/**
 * Where the room service is and how a shared link names a room. Kept apart from `online.ts`,
 * which holds the socket client: the app reads these two before it has drawn anything, and
 * `online.ts` reaches the race-end helper and through it the CPU, so importing it for these
 * would put the whole opponent in the first paint for a match that may never start (backlog P1).
 */

/** The room service's address from the build, or null when the build was given none. */
export function roomEndpoint(): string | null {
  const raw: unknown = import.meta.env.VITE_ROOM_URL
  const trimmed = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
  return trimmed === '' ? null : trimmed
}

/** A typed or pasted code as the service spells it, or null when it is not one. */
export function normalizeCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, '')
  return isRoomCode(code) ? code : null
}

/** The room code in a shared link's query string, when there is a valid one. */
export function roomFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get('room')
  return raw === null ? null : normalizeCode(raw)
}

/** The link to share for a room. */
export function roomLink(code: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?room=${code}`
}
