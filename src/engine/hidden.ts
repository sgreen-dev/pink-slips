/**
 * The stand-in for a card a view does not show (DESIGN.md 13). It sits apart from redact.ts so
 * the match rules can recognise it without the two files importing each other.
 */
export const HIDDEN_CARD = '?'

/** True when a card id stands for a hidden card in a view. */
export function isHidden(cardId: string): boolean {
  return cardId === HIDDEN_CARD
}
