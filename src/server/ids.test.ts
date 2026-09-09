import { describe, expect, it } from 'vitest'
import { CODE_ALPHABET, CODE_LENGTH, isRoomCode } from '../protocol/messages.ts'
import { newCode, randomToken, sha256 } from './ids.ts'

/**
 * The random values the service hands out. They lived inside `server/worker.ts` where nothing
 * could reach them (backlog Q37); what matters about each is pinned here.
 */

describe('a room code', () => {
  it('is always one the protocol will accept', () => {
    for (let i = 0; i < 200; i++) {
      const code = newCode()
      expect(isRoomCode(code), code).toBe(true)
      expect(code).toHaveLength(CODE_LENGTH)
    }
  })

  it('uses only the alphabet, which leaves out the look-alike characters', () => {
    // No O/0 or I/1, since a player reads one of these aloud to a friend.
    for (const character of newCode()) expect(CODE_ALPHABET.includes(character)).toBe(true)
    expect(CODE_ALPHABET).not.toMatch(/[O01I]/)
  })

  it('does not repeat itself in any run worth calling random', () => {
    const seen = new Set(Array.from({ length: 500 }, () => newCode()))
    expect(seen.size).toBeGreaterThan(495)
  })
})

describe('a token', () => {
  it('is hex with the dashes taken out, and never repeats', () => {
    const token = randomToken()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    const seen = new Set(Array.from({ length: 200 }, () => randomToken()))
    expect(seen.size).toBe(200)
  })
})

describe('the hash a token is stored under', () => {
  it('is SHA-256, and the same value every time', async () => {
    const once = await sha256('a-token')
    expect(once).toMatch(/^[0-9a-f]{64}$/)
    expect(await sha256('a-token')).toBe(once)
  })

  it('differs for a token that differs by one character', async () => {
    expect(await sha256('a-token')).not.toBe(await sha256('a-tokem'))
  })

  it('matches the published digest for a known value', async () => {
    // Guards against a change of algorithm silently signing every player out.
    expect(await sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
