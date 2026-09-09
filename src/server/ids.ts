import { CODE_ALPHABET, CODE_LENGTH } from '../protocol/messages.ts'

/**
 * The random values the service hands out: session and recovery tokens, room codes, and the
 * hash both are stored under. Pulled out of `server/worker.ts` so they can be tested on their
 * own (backlog Q37). All three use the platform's crypto, which Node and Cloudflare both have.
 */

/** A session or recovery token: a UUID with the dashes taken out. */
export function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** What a token is stored under, never the token itself (backlog S9). */
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A room code in the alphabet the protocol accepts, which leaves out look-alike characters. */
export function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH))
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}
