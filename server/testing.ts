/**
 * A stand-in for the platform, so the Cloudflare glue can be tested in place (backlog Q41).
 *
 * The objects in this directory extend `DurableObject` from `cloudflare:workers`, a module that
 * exists only inside a worker, so until now none of them could be loaded by a test at all. The
 * test runner points that import here instead (see `vite.config.ts`), and the real classes run
 * against fakes of the small part of the platform they touch: key-value storage with its one
 * alarm, the hibernatable socket list, and a namespace of other objects to fetch. A deployed
 * worker never loads this file.
 */

/** The base class every Durable Object extends, with the two fields the real one gives it. */
export class DurableObject<Env = unknown> {
  protected readonly ctx: DurableObjectState
  protected readonly env: Env
  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx
    this.env = env
  }
}

/** Storage as a Durable Object has it, in memory, with every write kept for a test to read. */
export class FakeStorage {
  readonly data = new Map<string, unknown>()
  /** The keys of each write, in order: one entry per `put`, however many keys it carried. */
  readonly writes: string[][] = []
  alarm: number | null = null

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined
  }

  async put(key: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const entries = typeof key === 'string' ? { [key]: value } : key
    this.writes.push(Object.keys(entries))
    for (const [name, item] of Object.entries(entries)) this.data.set(name, structuredClone(item))
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }

  async deleteAll(): Promise<void> {
    this.data.clear()
  }

  async list<T>(options: { prefix?: string } = {}): Promise<Map<string, T>> {
    const keys = [...this.data.keys()].filter((key) => key.startsWith(options.prefix ?? '')).sort()
    return new Map(keys.map((key) => [key, structuredClone(this.data.get(key)) as T]))
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm
  }

  async setAlarm(at: number | Date): Promise<void> {
    this.alarm = typeof at === 'number' ? at : at.getTime()
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = null
  }
}

/** A message an object sent a socket, parsed. */
export type Message = { type: string; [field: string]: unknown }

/** A hibernatable socket: what the object sends it, its attachment, and whether it was closed. */
export class FakeSocket {
  readonly sent: Message[] = []
  closed: { code: number | undefined; reason: string | undefined } | null = null
  private attached: unknown = null

  serializeAttachment(value: unknown): void {
    this.attached = structuredClone(value)
  }

  deserializeAttachment(): unknown {
    return structuredClone(this.attached)
  }

  send(message: string): void {
    if (this.closed) throw new Error('The socket is closed')
    this.sent.push(JSON.parse(message) as Message)
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason }
  }

  /** The last message of one type this socket was sent. */
  last(type: string): Message | undefined {
    return this.sent.findLast((message) => message.type === type)
  }

  /** The socket as the objects' handlers take it. */
  asSocket(): WebSocket {
    return this as unknown as WebSocket
  }
}

/** The part of `DurableObjectState` the objects use: storage, the socket list, and start-up. */
export class FakeState {
  readonly storage = new FakeStorage()
  private readonly sockets: FakeSocket[] = []
  /** The start-up work the constructor handed `blockConcurrencyWhile`, for a test to await. */
  ready: Promise<unknown> = Promise.resolve()

  blockConcurrencyWhile<T>(work: () => Promise<T>): Promise<T> {
    const done = work()
    this.ready = done
    return done
  }

  acceptWebSocket(ws: FakeSocket): void {
    this.sockets.push(ws)
  }

  /** The sockets still open, as the platform lists them once a close has completed. */
  getWebSockets(): FakeSocket[] {
    return this.sockets.filter((ws) => ws.closed === null)
  }

  /** A socket accepted the way `fetch` accepts one after an upgrade, carrying `attachment`. */
  connect(attachment: unknown): FakeSocket {
    const ws = new FakeSocket()
    ws.serializeAttachment(attachment)
    this.acceptWebSocket(ws)
    return ws
  }

  /** This stand-in as the objects' constructors take it. */
  asState(): DurableObjectState {
    return this as unknown as DurableObjectState
  }
}

/** A request one object sent another through a namespace: where, and the body it carried. */
export interface Delivery {
  url: string
  body: unknown
}

/**
 * A namespace of objects that all answer with `answer`, recording every request they are sent.
 * An answer that throws is a subrequest that failed.
 */
export function fakeNamespace(answer: (request: Delivery) => Response | Promise<Response>) {
  const requests: Delivery[] = []
  const stub = {
    fetch: async (url: string, init?: { body?: string }): Promise<Response> => {
      const request: Delivery = {
        url,
        body: init?.body === undefined ? null : (JSON.parse(init.body) as unknown),
      }
      requests.push(request)
      return answer(request)
    },
  }
  return { requests, namespace: { idFromName: (name: string) => name, get: () => stub } }
}
