import { getCar } from '../data/cars.ts'
import { getMod } from '../data/mods.ts'
import { powerToWeight, TIER_LABEL } from '../data/tiers.ts'
import { CAR_TYPE_LABEL } from '../data/types.ts'
import { computeAdvance, partSlots, TUNABLES } from '../engine/index.ts'
import { typeIdentityLines } from './rules.ts'

/**
 * What the card detail panel shows (DESIGN.md 8, Card detail): the real car's published
 * figures with their source, and a mod's full rules text with how its family plays. Pure so
 * the rows can be tested without a browser; the panel only lays them out.
 */

export interface DetailRow {
  label: string
  value: string
}

/** The advance the engine gives the stock car: no wear, no mods, not a first advance, from 0 ft. */
export function stockAdvanceFt(carId: string): number {
  return computeAdvance({ car: getCar(carId), wear: 0, startFt: 0, isFirstAdvanceOfRace: false })
    .finalFt
}

export function carDetailRows(carId: string): DetailRow[] {
  const car = getCar(carId)
  const identity = typeIdentityLines()[car.type]
  const rows: DetailRow[] = [
    {
      label: 'Make and model',
      value: `${car.make} ${car.model}${car.generation ? ` (${car.generation})` : ''}`,
    },
    { label: 'Type', value: `${CAR_TYPE_LABEL[car.type]}: ${identity}` },
    {
      label: 'Tier',
      value: `${TIER_LABEL[car.tier]}: needs ${TUNABLES.fuelCostByTier[car.tier]} fuel to advance, ${partSlots(car)} Part slots`,
    },
    {
      label: 'Advance per turn',
      value: `${stockAdvanceFt(carId).toLocaleString('en-US')} ft stock, with no wear`,
    },
    { label: 'Horsepower', value: `${car.hp.toLocaleString('en-US')} hp` },
    { label: 'Weight', value: `${car.weightLb.toLocaleString('en-US')} lb` },
    {
      label: 'Power to weight',
      value: `${powerToWeight(car.hp, car.weightLb).toFixed(3)} hp per lb`,
    },
    { label: 'Drivetrain', value: car.drivetrain },
    { label: '0–60 mph', value: `${car.zeroToSixtySec} s` },
    { label: 'Top speed', value: `${car.topSpeedMph} mph` },
    { label: 'Engine', value: car.engine },
    { label: 'Built', value: car.productionYears },
  ]
  if (car.tierNote) rows.push({ label: 'Tier note', value: car.tierNote })
  rows.push({ label: 'Source', value: car.source })
  return rows
}

function familySentence(modId: string): string {
  const mod = getMod(modId)
  const { partSlots: slots, partSlotsJdm } = TUNABLES
  switch (mod.family) {
    case 'part':
      return `A Part attaches permanently to one of your cars, any car in the garage with an open slot: ${slots} slots on a car, ${partSlotsJdm} on a JDM car.`
    case 'boost':
      return 'A Boost is played once and discarded. It helps your staged car or your turn, at most one Boost per turn.'
    case 'sabotage':
      return mod.kind === 'traction'
        ? "A Traction sabotage is played once and discarded. It shortens or stops the opponent's staged car's next advance, at most one Sabotage per turn."
        : "A Pit sabotage is played once and discarded. It takes the opponent's staged car's fuel or a Part, adds wear, or blocks its next Boost, at most one Sabotage per turn."
  }
}

export function modDetailRows(modId: string): DetailRow[] {
  const mod = getMod(modId)
  const family =
    mod.family === 'sabotage'
      ? `Sabotage, ${mod.kind === 'traction' ? 'Traction' : 'Pit'}`
      : mod.family === 'part'
        ? 'Part'
        : 'Boost'
  const rows: DetailRow[] = [
    { label: 'Family', value: family },
    { label: 'Rules text', value: mod.text },
  ]
  if (mod.typeLock) {
    rows.push({ label: 'Type lock', value: `${CAR_TYPE_LABEL[mod.typeLock]} cars only` })
  }
  if (mod.family === 'boost' && mod.fuelCost) {
    rows.push({ label: 'Cost', value: `${mod.fuelCost} fuel from your staged car when played` })
  }
  rows.push({
    label: 'Rarity',
    value:
      mod.rarity === 'rare'
        ? `Rare: at most ${TUNABLES.maxCopiesPerRareMod} per deck, ${Math.round(TUNABLES.collection.rareModOdds * 100)}% of pack mod slots`
        : `Common: up to ${TUNABLES.maxCopiesPerMod} per deck`,
  })
  if ((mod.level ?? 1) > 1) {
    rows.push({
      label: 'Level',
      value: `Level ${mod.level}${mod.upgradeOf ? `, an upgrade of ${getMod(mod.upgradeOf).name}` : ''}`,
    })
  }
  rows.push({ label: 'How it plays', value: familySentence(modId) })
  return rows
}
