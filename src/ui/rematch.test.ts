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
    // A view is now shape-checked like every other message rather than cast, so an empty one
    // is dropped instead of reaching the board and crashing it.
    expect(parseServerMessage('{"type":"state","view":{},"names":["a","b"]}')).toBeNull()
    const view = JSON.stringify(redact(createMatch(starterConfig(), 3), 0))
    expect(parseServerMessage(`{"type":"state","view":${view},"names":["a","b"]}`)).toMatchObject({
      plates: [0, 0],
      turnMsLeft: null,
    })
    expect(
      parseServerMessage(`{"type":"state","view":${view},"names":["a","b"],"plates":[2,0]}`),
    ).toMatchObject({ plates: [2, 0] })
  })

  it('tracks who accepted and starts over when a fresh match arrives after a result', () => {
    const names = ['Ann', 'Bo'] as const
    const over = playOutRandomly(createMatch(starterConfig(), 3), 3)
    let session = startOnline('ABCDEF', 'Ann')
    session = reduceOnline(session, {
      type: 'message',
      at: 0,
      message: { type: 'welcome', code: 'ABCDEF', seat: 0, token: 't' },
    })
    session = reduceOnline(session, {
      type: 'message',
      at: 0,
      message: { type: 'state', view: redact(over, 0), names, plates: [0, 0], turnMsLeft: null },
    })
    session = reduceOnline(session, {
      type: 'message',
      at: 0,
      message: { type: 'result', packsEarned: 1, rating: null, stakes: null },
    })
    session = reduceOnline(session, {
      type: 'message',
      at: 0,
      message: { type: 'rematch', accepted: [false, true] },
    })
    expect(session.rematch).toEqual([false, true])
    expect(session.result).not.toBeNull()
    const fresh = createMatch({ ...starterConfig(), firstPlayer: 1 }, 4)
    session = reduceOnline(session, {
      type: 'message',
      at: 0,
      message: { type: 'state', view: redact(fresh, 0), names, plates: [0, 0], turnMsLeft: null },
    })
    expect(session.result).toBeNull()
    expect(session.rematch).toEqual([false, false])
    expect(session.raceEnd).toBeNull()
    expect(session.view?.race.number).toBe(1)
  })
})
