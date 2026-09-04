/**
 * The filter on player names (DESIGN.md 13). Names show on a public leaderboard to an audience
 * that includes kids, so a short list of words is refused, along with a few names reserved
 * for the game itself. Spelling tricks are undone before the check: case, look-alike digits
 * and symbols, accents, spaces and punctuation, and stretched letters. The same check runs on
 * the service, where names are set, and in the browser, for a reason before the button.
 */

export const MAX_NAME_LENGTH = 24

/** Refused wherever they appear in a name, after normalisation. Unambiguous on their own. */
const ANYWHERE: readonly string[] = [
  'fuck',
  'nigg',
  'fagg',
  'kike',
  'wetback',
  'tranny',
  'retard',
  'hitler',
  'nazi',
  'porn',
  'dildo',
  'blowjob',
  'jizz',
  'cocksuck',
  'motherf',
]

/** Refused at the start of a word: caught with any ending, but not inside a place name. */
const AT_START: readonly string[] = ['cunt']

/** Refused as a whole word, since each also sits inside ordinary words. */
const AS_WORD: readonly string[] = [
  'shit',
  'bitch',
  'ass',
  'arse',
  'dick',
  'cock',
  'pussy',
  'whore',
  'slut',
  'fag',
  'coon',
  'spic',
  'chink',
  'rape',
  'rapist',
  'penis',
  'vagina',
  'cum',
  'sex',
  'sexy',
  'kkk',
]

/** Names the game uses for itself, or that would read as staff. */
const RESERVED: readonly string[] = [
  'cpu',
  'admin',
  'administrator',
  'moderator',
  'mod',
  'staff',
  'owner',
  'system',
  'pinkslips',
]

const LOOKALIKES: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
  '+': 't',
}

/** Lower case, accents stripped, look-alikes mapped, everything but letters turned to spaces. */
export function normalizeName(raw: string): string {
  const plain = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  let out = ''
  for (const ch of plain) {
    const mapped = LOOKALIKES[ch] ?? ch
    out += /[a-z]/.test(mapped) ? mapped : ' '
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Runs of the same letter collapsed to one, so stretched spellings match too. */
function collapse(text: string): string {
  return text.replace(/([a-z])\1+/g, '$1')
}

function hits(text: string): boolean {
  const joined = text.replace(/ /g, '')
  const squeezed = collapse(joined)
  for (const word of ANYWHERE) {
    if (joined.includes(word) || squeezed.includes(collapse(word))) return true
  }
  const tokens = new Set([...text.split(' '), joined, ...text.split(' ').map(collapse), squeezed])
  for (const word of AT_START) {
    for (const token of tokens)
      if (token.startsWith(word) || token.startsWith(collapse(word))) return true
  }
  for (const word of AS_WORD) {
    if (tokens.has(word) || tokens.has(collapse(word))) return true
  }
  return false
}

/** Why a name is refused, or null when it is fine. The reasons are written for the player. */
export function nameProblem(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'Type a name.'
  if (trimmed.length > MAX_NAME_LENGTH) return `Names are at most ${MAX_NAME_LENGTH} characters.`
  const normalized = normalizeName(trimmed)
  if (normalized.replace(/ /g, '').length === 0) return 'A name needs at least one letter.'
  if (RESERVED.includes(normalized.replace(/ /g, ''))) return 'That name is taken by the game.'
  if (hits(normalized)) return 'That name is not allowed here. Try another.'
  return null
}

export function isNameAllowed(raw: string): boolean {
  return nameProblem(raw) === null
}

/** The name as it may be shown: itself when allowed, otherwise a plain stand-in. */
export function safeDisplayName(raw: string, fallback = 'Player'): string {
  const trimmed = raw.trim().slice(0, MAX_NAME_LENGTH)
  return isNameAllowed(trimmed) ? trimmed : fallback
}
