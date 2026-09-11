import type { Pack } from '../collection/collection.ts'
import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'

/**
 * What an opened pack says to a screen reader: how many cars and mods, and which are new to the
 * collection. The cards themselves are for the eye; read out whole, five of them came to some fifty
 * fragments queued as one announcement (backlog A8).
 */
export function packSummary(pack: Pack, fresh: ReadonlySet<string>): string {
  const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
  const opened = `Pack opened: ${count(pack.cars.length, 'car')} and ${count(pack.mods.length, 'mod')}.`
  const names = [
    ...pack.cars.filter((card) => fresh.has(card.id)).map((card) => getCar(card.id).name),
    ...pack.mods.filter((card) => fresh.has(card.id)).map((card) => getMod(card.id).name),
  ]
  if (names.length === 0) return `${opened} Nothing new.`
  return `${opened} New: ${[...new Set(names)].join(', ')}.`
}
