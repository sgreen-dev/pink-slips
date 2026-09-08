import {
  ALL_CARD_IDS,
  openPack,
  packCards,
  starterCollection,
  owns,
} from '../collection/collection.ts'
import { CARS } from '../data/cars.ts'
import { seedRng, TUNABLES, type RngState } from '../engine/index.ts'

/** `npm run sim -- --packs 10000`: how many packs a player opens before owning everything. */

export interface PackReport {
  trials: number
  seed: number
  cards: number
  startingOwned: number
  /** Laps already taken, which size the packs (DESIGN.md 12, Laps). */
  laps: number
  meanToComplete: number
  medianToComplete: number
  /** Packs to own every car, the lap's own bar. */
  meanToAllCars: number
  medianToAllCars: number
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

export function runPackSimulation(options: {
  trials: number
  seed: number
  laps?: number
}): PackReport {
  const laps = options.laps ?? 0
  const ultraRare = new Set(CARS.filter((car) => car.tier === 'hyper').map((car) => car.id))
  const carIds = new Set(CARS.map((car) => car.id))
  const starter = starterCollection()
  const toComplete: number[] = []
  const toAllCars: number[] = []
  const toUltraRare: number[] = []
  let rng: RngState = seedRng(options.seed)
  for (let trial = 0; trial < options.trials; trial++) {
    const missing = new Set(ALL_CARD_IDS.filter((id) => !owns(starter, id)))
    let packs = 0
    let firstUltraRare = 0
    let allCars = 0
    while (missing.size > 0) {
      packs++
      let pack
      ;[pack, rng] = openPack(rng, TUNABLES, laps)
      if (firstUltraRare === 0 && pack.cars.some((card) => ultraRare.has(card.id))) {
        firstUltraRare = packs
      }
      for (const { id } of packCards(pack)) missing.delete(id)
      if (allCars === 0 && ![...missing].some((id) => carIds.has(id))) allCars = packs
    }
    toComplete.push(packs)
    toAllCars.push(allCars)
    toUltraRare.push(firstUltraRare)
  }
  return {
    trials: options.trials,
    seed: options.seed,
    cards: ALL_CARD_IDS.length,
    startingOwned: ALL_CARD_IDS.length - ALL_CARD_IDS.filter((id) => !owns(starter, id)).length,
    laps,
    meanToComplete: mean(toComplete),
    medianToComplete: median(toComplete),
    meanToAllCars: mean(toAllCars),
    medianToAllCars: median(toAllCars),
    meanToFirstUltraRare: mean(toUltraRare),
    medianToFirstUltraRare: median(toUltraRare),
  }
}

export function formatPackReport(r: PackReport): string {
  return [
    `Packs: ${r.trials} runs at seed ${r.seed}, starting with ${r.startingOwned} of ${r.cards} cards, ${r.laps} laps taken`,
    `  packs to own every card: mean ${r.meanToComplete.toFixed(0)}, median ${r.medianToComplete}`,
    `  packs to own every car, the next lap: mean ${r.meanToAllCars.toFixed(0)}, median ${r.medianToAllCars}`,
    `  packs to the first Ultra Rare car: mean ${r.meanToFirstUltraRare.toFixed(1)}, median ${r.medianToFirstUltraRare}`,
  ].join('\n')
}
