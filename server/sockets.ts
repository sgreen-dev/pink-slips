import type { ServerMessage } from '../src/protocol/messages.ts'
import type { Budget } from '../src/server/budget.ts'
import type { Waiting } from '../src/server/queue.ts'
import type { SeatIdentity } from '../src/server/room.ts'

/**
 * What each socket carries and how a message reaches it. Shared by the room and the queue, so
 * it sits apart from both (backlog Q37).
 */

export interface Attachment {
  seat: 0 | 1 | null
  identity: SeatIdentity | null
  /** The room this socket opened, so an unstored room can be rebuilt after hibernation. */
  code?: string
  /** What this socket may still send the room (backlog S20). */
  budget?: Budget
}

export interface QueueAttachment extends Waiting {
  name: string
  /** Set once the queue has handed this socket a match. */
  matched?: boolean
}

export function attachment(ws: WebSocket): Attachment {
  const value = ws.deserializeAttachment() as Attachment | null
  return value ?? { seat: null, identity: null }
}

/**
 * The queue's record for a socket, or null for one that carries none. The queue sets one on every
 * socket it accepts, but reading a socket without one used to throw inside the alarm, the only
 * thing that re-arms the queue, so one bad socket left everyone waiting (backlog S22).
 */
export function queueAttachment(ws: WebSocket): QueueAttachment | null {
  const value = ws.deserializeAttachment() as QueueAttachment | null
  return value && typeof value.accountId === 'string' ? value : null
}

export function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // A socket that is already gone gets its close event; nothing to do here.
  }
}
