import { otherPlayer } from './match.ts'
import type { MatchState, PlayerIndex, PlayerState } from './types.ts'

/**
 * What one player is allowed to see of a match (DESIGN.md 13). The server keeps the full state
 * and sends each player a view: their own hand, the opponent's hand as a count, both decks as
 * counts, everything on the table as is. A view has the shape of a MatchState so the board and
 * the legality helpers run on it unchanged: hidden cards are replaced by HIDDEN_CARD, the
 * viewer's own deck keeps its cards but in sorted order so nothing about draw order leaks, and
 * the random state is zeroed so the future cannot be simulated.
 */

export const HIDDEN_CARD = '?'

export function redact(state: MatchState, viewer: PlayerIndex): MatchState {
  const opponent = otherPlayer(viewer)
  const me = state.players[viewer]
  const them = state.players[opponent]
  const own: PlayerState = {
    ...me,
    deck: [...me.deck].sort(),
  }
  const theirs: PlayerState = {
    ...them,
    hand: them.hand.map(() => HIDDEN_CARD),
    deck: them.deck.map(() => HIDDEN_CARD),
  }
  const players: MatchState['players'] = viewer === 0 ? [own, theirs] : [theirs, own]
  return { ...state, players, rng: 0 }
}

/** True when a card id stands for a hidden card in a view. */
export function isHidden(cardId: string): boolean {
  return cardId === HIDDEN_CARD
}
