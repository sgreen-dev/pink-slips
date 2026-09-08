import { chooseAction } from '../src/cpu/index.ts'
import { STARTERS } from '../src/data/starters.ts'
import { currentPlayer, isOver, type MatchState, type PlayerIndex } from '../src/engine/index.ts'
import { parseServerMessage, type ServerMessage } from '../src/protocol/messages.ts'

/**
 * The live check for online play: two fresh players queue, get paired, play a ranked match
 * through the service, and their ratings move. Run against any deployment:
 *
 *   node scripts/online-smoke.ts https://pink-slips-rooms.pink-slips-counter.workers.dev
 *
 * Needs Node 24 for the global fetch and WebSocket. The service admits sockets with no
 * Origin header, which is what a script sends.
 */

const endpoint = (process.argv[2] ?? 'http://localhost:8787').replace(/\/+$/, '')
/** With --stakes both players queue for stakes and each side's transfer is printed. */
const stakes = process.argv.includes('--stakes')
/** With --rematch the two players share a friend room, play a match and its rematch, and the first move must swap. */
const rematch = process.argv.includes('--rematch')
const socketBase = endpoint.replace(/^http/, 'ws')

interface Player {
  name: string
  token: string
  rating: number
}

async function createPlayer(name: string): Promise<Player> {
  const response = await fetch(`${endpoint}/auth/player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  if (!response.ok) throw new Error(`Could not create ${name}: ${response.status}`)
  const made = (await response.json()) as { token: string; data: { profile: { rating: number } } }
  return { name, token: made.token, rating: made.data.profile.rating }
}

function listen(ws: WebSocket, onMessage: (message: ServerMessage) => void): void {
  ws.addEventListener('message', (event) => {
    const message = parseServerMessage(String((event as MessageEvent).data))
    if (message) onMessage(message)
  })
}

/** Waits in the queue until the service names a room and a ticket. */
function queue(player: Player): Promise<{ code: string; ticket: string; opponent: string }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${socketBase}/queue?session=${encodeURIComponent(player.token)}${stakes ? '&stakes=1' : ''}`,
    )
    const timer = setTimeout(() => reject(new Error(`${player.name} waited too long`)), 60_000)
    listen(ws, (message) => {
      if (message.type === 'error') reject(new Error(message.reason))
      if (message.type === 'matched') {
        clearTimeout(timer)
        resolve({ code: message.code, ticket: message.ticket, opponent: message.opponent })
      }
    })
    ws.addEventListener('error', () => reject(new Error(`${player.name}: queue socket failed`)))
  })
}

interface Outcome {
  seat: PlayerIndex
  packs: number | null
  rating: { before: number; after: number } | null
  winner: PlayerIndex | null
  /** The first player of each match played, in order. */
  firsts: PlayerIndex[]
}

/** Joins the room with the ticket and plays every turn of its seat from its own view. */
function play(
  player: Player,
  code: string,
  ticket: string | undefined,
  seed: number,
  matches = 1,
): Promise<Outcome> {
  const starter = STARTERS[seed % STARTERS.length]
  if (!starter) throw new Error('No starter garage')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${socketBase}/room/${code}?session=${encodeURIComponent(player.token)}`,
    )
    let seat: PlayerIndex | null = null
    let winner: PlayerIndex | null = null
    let results = 0
    const firsts: PlayerIndex[] = []
    const timer = setTimeout(
      () => reject(new Error(`${player.name}: match took too long`)),
      120_000 * matches,
    )
    ws.addEventListener('open', () => {
      const garage = { garage: starter.cars, deck: starter.deck }
      ws.send(JSON.stringify({ type: 'join', stakes, name: player.name, garage, ticket }))
    })
    listen(ws, (message) => {
      if (message.type === 'error') reject(new Error(`${player.name}: ${message.reason}`))
      if (message.type === 'welcome') seat = message.seat
      if (message.type === 'state' && seat !== null) {
        const view: MatchState = message.view
        if (firsts.length === results) firsts.push(view.firstPlayer)
        winner = isOver(view)
        if (winner !== null) return
        if (currentPlayer(view) !== seat) return
        const action = chooseAction(view, seat, seed)
        ws.send(JSON.stringify({ type: 'act', action }))
      }
      if (message.type === 'result' && seat !== null) {
        if (stakes) console.log(`${player.name}: stakes ${JSON.stringify(message.stakes)}`)
        results += 1
        if (results < matches) {
          ws.send(JSON.stringify({ type: 'rematch' }))
          return
        }
        clearTimeout(timer)
        ws.close()
        resolve({ seat, packs: message.packsEarned, rating: message.rating, winner, firsts })
      }
    })
    ws.addEventListener('error', () => reject(new Error(`${player.name}: room socket failed`)))
  })
}

async function main(): Promise<void> {
  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const [ann, bo] = await Promise.all([
    createPlayer(`Smoke Ann ${stamp}`),
    createPlayer(`Smoke Bo ${stamp}`),
  ])
  console.log(`Players made: ${ann.name} and ${bo.name}, rating ${ann.rating} each`)
  if (rematch) {
    const made = (await (await fetch(`${endpoint}/new`)).json()) as { code?: string }
    if (!made.code) throw new Error('Could not make a room')
    console.log(`Friend room ${made.code}: a match and its rematch`)
    const [outA, outB] = await Promise.all([
      play(ann, made.code, undefined, 3, 2),
      play(bo, made.code, undefined, 5, 2),
    ])
    for (const [player, out] of [
      [ann, outA],
      [bo, outB],
    ] as const) {
      console.log(
        `${player.name} (seat ${out.seat}): first moves ${out.firsts.join(' then ')}, ${out.packs} packs after the rematch`,
      )
      if (out.firsts.length !== 2 || out.firsts[0] === out.firsts[1]) {
        throw new Error('The rematch did not swap the first move')
      }
    }
    console.log('Rematch smoke check passed')
    return
  }
  const [matchA, matchB] = await Promise.all([queue(ann), queue(bo)])
  if (matchA.code !== matchB.code) throw new Error('The two players were not paired together')
  console.log(`Paired in room ${matchA.code}: ${ann.name} against ${matchA.opponent}`)
  const [outA, outB] = await Promise.all([
    play(ann, matchA.code, matchA.ticket, 3),
    play(bo, matchB.code, matchB.ticket, 5),
  ])
  for (const [player, out] of [
    [ann, outA],
    [bo, outB],
  ] as const) {
    const won = out.winner === out.seat ? 'won' : 'lost'
    const rating = out.rating ? `${out.rating.before} to ${out.rating.after}` : 'unchanged'
    console.log(`${player.name} (seat ${out.seat}) ${won}: ${out.packs} packs, rating ${rating}`)
  }
  const board = (await (await fetch(`${endpoint}/leaderboard`)).json()) as {
    name: string
    rating: number
    wins: number
    losses: number
  }[]
  const rows = board.filter((row) => row.name === ann.name || row.name === bo.name)
  for (const row of rows)
    console.log(`Leaderboard: ${row.name} ${row.rating} (${row.wins}-${row.losses})`)
  const moved = outA.rating && outB.rating && outA.rating.after !== outA.rating.before
  if (!moved || rows.length !== 2) throw new Error('Ratings did not move for both players')
  console.log('Online smoke check passed')
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
