import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import type { LogEntry } from '../engine/index.ts'

/** Turns a log entry into a sentence for the match log, or null for entries not worth showing. */
export function describeLogEntry(entry: LogEntry, names: readonly [string, string]): string | null {
  switch (entry.kind) {
    case 'coinFlip':
      if (entry.purpose === 'firstPlayer') {
        return `Coin flip: ${entry.heads ? 'heads' : 'tails'}. ${names[entry.firstPlayer]} goes first.`
      }
      return `${names[entry.player]} flips ${entry.heads ? 'heads' : 'tails'}${entry.forcedBySports ? ' (Sports precision)' : ''}.`
    case 'turnStart':
    case 'draw':
      return null
    case 'reshuffle':
      return `${names[entry.player]} shuffles ${entry.count} cards from the discard pile back into the deck.`
    case 'stage':
      return `${names[entry.player]} stages the ${getCar(entry.carId).name}.`
    case 'fuel':
      return `${names[entry.player]} fuels the ${getCar(entry.carId).name}.`
    case 'playPart':
      return `${names[entry.player]} fits ${getMod(entry.modId).name} to the ${getCar(entry.carId).name}.`
    case 'playBoost':
      return `${names[entry.player]} plays ${getMod(entry.modId).name}.`
    case 'playSabotage':
      return `${names[entry.player]} plays ${getMod(entry.modId).name}.`
    case 'discardPart':
      return `${names[entry.player]} loses ${getMod(entry.modId).name} from the ${getCar(entry.carId).name}.`
    case 'advance':
      return `${names[entry.player]}'s ${getCar(entry.carId).name} advances ${entry.toFt - entry.fromFt} ft to ${entry.toFt} ft.`
    case 'tractionIgnored':
      return `${names[entry.player]}'s car ${entry.reason === 'immune' ? 'is immune to' : 'is shielded from'} the Traction sabotage.`
    case 'advanceSkipped':
      switch (entry.reason) {
        case 'firstTurn':
          return `${names[entry.player]} skips the first advance.`
        case 'notFueled':
          return `${names[entry.player]}'s car is not fueled enough to advance.`
        case 'redLight':
          return `Red Light: ${names[entry.player]}'s car sits at the line.`
      }
      break
    case 'raceEnd':
      return `Race ${entry.race}: ${names[entry.winner]} wins and takes the ${getCar(entry.capturedCarId).name} as a pink slip.`
    case 'matchEnd':
      return `${names[entry.winner]} wins the match with three pink slips.`
    case 'concede':
      return `${names[entry.player]} concedes. ${names[entry.player === 0 ? 1 : 0]} wins the match.`
  }
  return null
}
