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
    const ws = new WebSocket(`${socketBase}/queue?session=${encodeURIComponent(player.token)}`)
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
}

/** Joins the room with the ticket and plays every turn of its seat from its own view. */
function play(player: Player, code: string, ticket: string, seed: number): Promise<Outcome> {
  const starter = STARTERS[seed % STARTERS.length]
  if (!starter) throw new Error('No starter garage')
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `${socketBase}/room/${code}?session=${encodeURIComponent(player.token)}`,
    )
    let seat: PlayerIndex | null = null
    let winner: PlayerIndex | null = null
    const timer = setTimeout(
      () => reject(new Error(`${player.name}: match took too long`)),
      120_000,
    )
    ws.addEventListener('open', () => {
      const garage = { garage: starter.cars, deck: starter.deck }
      ws.send(JSON.stringify({ type: 'join', name: player.name, garage, ticket }))
    })
    listen(ws, (message) => {
      if (message.type === 'error') reject(new Error(`${player.name}: ${message.reason}`))
      if (message.type === 'welcome') seat = message.seat
      if (message.type === 'state' && seat !== null) {
        const view: MatchState = message.view
        winner = isOver(view)
        if (winner !== null) return
        if (currentPlayer(view) !== seat) return
        const action = chooseAction(view, seat, seed)
        ws.send(JSON.stringify({ type: 'act', action }))
      }
      if (message.type === 'result' && seat !== null) {
        clearTimeout(timer)
        ws.close()
        resolve({ seat, packs: message.packsEarned, rating: message.rating, winner })
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
