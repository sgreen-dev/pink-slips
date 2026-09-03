import {
  ALL_CARD_IDS,
  openPack,
  packCards,
  starterCollection,
  owns,
} from '../collection/collection.ts'
import { CARS } from '../data/cars.ts'
import { seedRng, type RngState } from '../engine/index.ts'

/** `npm run sim -- --packs 10000`: how many packs a player opens before owning everything. */

export interface PackReport {
  trials: number
  seed: number
  cards: number
  startingOwned: number
  meanToComplete: number
  medianToComplete: number
  meanToFirstUltraRare: number
  medianToFirstUltraRare: number
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function mean(values: number[]): number {
  return values.reduce((sum, n) => sum + n, 0) / Math.max(1, values.length)
}

export function runPackSimulation(options: { trials: number; seed: number }): PackReport {
  const ultraRare = new Set(CARS.filter((car) => car.tier === 'hyper').map((car) => car.id))
  const starter = starterCollection()
  const toComplete: number[] = []
  const toUltraRare: number[] = []
  let rng: RngState = seedRng(options.seed)
  for (let trial = 0; trial < options.trials; trial++) {
    const missing = new Set(ALL_CARD_IDS.filter((id) => !owns(starter, id)))
    let packs = 0
    let firstUltraRare = 0
    while (missing.size > 0) {
      packs++
      let pack
      ;[pack, rng] = openPack(rng)
      if (firstUltraRare === 0 && pack.cars.some((card) => ultraRare.has(card.id))) {
        firstUltraRare = packs
      }
      for (const { id } of packCards(pack)) missing.delete(id)
    }
    toComplete.push(packs)
    toUltraRare.push(firstUltraRare)
  }
  return {
    trials: options.trials,
    seed: options.seed,
    cards: ALL_CARD_IDS.length,
    startingOwned: ALL_CARD_IDS.length - ALL_CARD_IDS.filter((id) => !owns(starter, id)).length,
    meanToComplete: mean(toComplete),
    medianToComplete: median(toComplete),
    meanToFirstUltraRare: mean(toUltraRare),
    medianToFirstUltraRare: median(toUltraRare),
  }
}

export function formatPackReport(r: PackReport): string {
  return [
    `Packs: ${r.trials} runs at seed ${r.seed}, starting with ${r.startingOwned} of ${r.cards} cards`,
    `  packs to own every card: mean ${r.meanToComplete.toFixed(0)}, median ${r.medianToComplete}`,
    `  packs to the first Ultra Rare car: mean ${r.meanToFirstUltraRare.toFixed(1)}, median ${r.medianToFirstUltraRare}`,
  ].join('\n')
}
