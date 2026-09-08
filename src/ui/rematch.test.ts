import { describe, expect, it } from 'vitest'
import { createMatch, redact } from '../engine/index.ts'
import { playOutRandomly, starterConfig } from '../engine/test-helpers.ts'
import { parseClientMessage, parseServerMessage } from '../protocol/messages.ts'
import { reduceOnline, startOnline } from './online.ts'

describe('rematch on the client', () => {
  it('parses both rematch messages', () => {
    expect(parseClientMessage('{"type":"rematch"}')).toEqual({ type: 'rematch' })
    expect(parseServerMessage('{"type":"rematch","accepted":[true,false]}')).toEqual({
      type: 'rematch',
      accepted: [true, false],
    })
    expect(parseServerMessage('{"type":"rematch","accepted":[true]}')).toBeNull()
  })

  it('tracks who accepted and starts over when a fresh match arrives after a result', () => {
    const names = ['Ann', 'Bo'] as const
    const over = playOutRandomly(createMatch(starterConfig(), 3), 3)
    let session = startOnline('ABCDEF', 'Ann')
    session = reduceOnline(session, {
      type: 'message',
      message: { type: 'welcome', code: 'ABCDEF', seat: 0, token: 't' },
    })
    session = reduceOnline(session, {
      type: 'message',
      message: { type: 'state', view: redact(over, 0), names },
    })
    session = reduceOnline(session, {
      type: 'message',
      message: { type: 'result', packsEarned: 1, rating: null, stakes: null },
    })
    session = reduceOnline(session, {
      type: 'message',
      message: { type: 'rematch', accepted: [false, true] },
    })
    expect(session.rematch).toEqual([false, true])
    expect(session.result).not.toBeNull()
    const fresh = createMatch({ ...starterConfig(), firstPlayer: 1 }, 4)
    session = reduceOnline(session, {
      type: 'message',
      message: { type: 'state', view: redact(fresh, 0), names },
    })
    expect(session.result).toBeNull()
    expect(session.rematch).toEqual([false, false])
    expect(session.raceEnd).toBeNull()
    expect(session.view?.race.number).toBe(1)
  })
})
