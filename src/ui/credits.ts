/**
 * Reading `public/art/CREDITS.md` back into rows the credits dialog can show.
 *
 * The card illustrations are cut and restyled from photographs on Wikimedia Commons, and most of
 * those photographs are shared under a licence that asks two things in return: name the
 * photographer, and pass the same freedom on. Naming them in a file nobody can open is not really
 * naming them, so `CreditsDialog` puts the list inside the game. This module is the half that can
 * be tested without a browser.
 *
 * The table is written by `scripts/art/make_art.py`, so this parser is coupled to that
 * generator's column order. That coupling is held by `credits.test.ts`, which parses the real
 * shipped file and checks every illustration comes back with a photographer and a licence — if
 * the generator's format ever moves, a test fails here rather than the dialog quietly emptying.
 */

/** One photograph, and what is owed for using it. */
export type Credit = {
  carId: string
  car: string
  photo: string
  photoUrl: string
  author: string
  license: string
  licenseUrl: string
}

/** The licence every photograph-derived illustration is passed on under. */
export const ART_LICENSE = {
  name: 'CC BY-SA 4.0',
  url: 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const

/** A `[text](url)` cell, or a plain one. Cells are generator output, so a miss is not an error. */
function link(cell: string): { text: string; url: string } {
  const match = /^\[(.*)\]\((.*)\)$/.exec(cell)
  return match ? { text: match[1] ?? '', url: match[2] ?? '' } : { text: cell, url: '' }
}

/**
 * Every credited illustration in the order the file lists them, which is by car id.
 *
 * Rows without a photograph — an illustration drawn rather than sourced — carry no obligation and
 * are left out, since a credits list is for the people owed a credit. Anything that is not a
 * five-column body row is skipped rather than throwing: this runs to draw a dialog, and a
 * malformed line should cost one entry, not the whole list.
 */
export function parseCredits(markdown: string): Credit[] {
  const credits: Credit[] = []
  for (const line of markdown.split('\n')) {
    const row = line.trim()
    if (!row.startsWith('|') || !row.endsWith('|')) continue
    const cells = row
      .slice(1, -1)
      .split('|')
      .map((cell) => cell.trim())
    if (cells.length !== 5) continue
    const [carId = '', car = '', photoCell = '', author = '', licenseCell = ''] = cells
    if (!/^[a-z0-9][a-z0-9-]*$/.test(carId)) continue // the header, and the `| --- |` rule
    const photo = link(photoCell)
    if (photo.url === '') continue // drawn, not sourced: nothing is owed
    const license = link(licenseCell)
    credits.push({
      carId,
      car,
      photo: photo.text,
      photoUrl: photo.url,
      author,
      license: license.text,
      licenseUrl: license.url,
    })
  }
  return credits
}
