import type { ServerMessage } from '../src/protocol/messages.ts'
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

export function queueAttachment(ws: WebSocket): QueueAttachment {
  return ws.deserializeAttachment() as QueueAttachment
}

export function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message))
  } catch {
    // A socket that is already gone gets its close event; nothing to do here.
  }
}
