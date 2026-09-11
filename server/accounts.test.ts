import { describe, expect, it } from 'vitest'
import { AccountDirectory } from './accounts.ts'
import type { Env } from './env.ts'
import type { QueueAttachment } from './sockets.ts'
import { fakeNamespace, FakeState } from './testing.ts'

/**
 * The directory object's queue, run against a stand-in for the platform (backlog Q41). Who pairs
 * with whom is tested in `src/server/queue.test.ts`; this is the alarm around it, the one thing
 * that keeps the queue moving.
 */

function waiting(accountId: string, address: string): QueueAttachment {
  return { accountId, name: accountId, rating: 1000, since: Date.now() - 60_000, address }
}

describe('the queue alarm', () => {
  it('pairs the players waiting even when one socket carries nothing', async () => {
    const rooms = fakeNamespace(() => new Response(null, { status: 204 }))
    const state = new FakeState()
    const queue = new AccountDirectory(state.asState(), {
      ROOMS: rooms.namespace,
    } as unknown as Env)
    const ann = state.connect(waiting('acct-a', '192.0.2.1'))
    const bo = state.connect(waiting('acct-b', '192.0.2.2'))
    // A socket with no record at all. Reading it used to throw inside the alarm, and the alarm
    // is what re-arms the queue, so everyone behind it waited (backlog S22).
    const broken = state.connect(null)
    await queue.alarm()
    expect(rooms.requests).toHaveLength(1)
    expect(ann.last('matched')).toBeDefined()
    expect(bo.last('matched')).toBeDefined()
    expect(broken.last('matched')).toBeUndefined()
  })
})
