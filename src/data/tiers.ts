import { TIERS, type Tier } from './types.ts'

/**
 * Tier bands in hp per lb (DESIGN.md 2.2). Daily is everything below the Performance floor.
 * Fuel cost by tier is an engine tunable and lives in src/engine/tunables.ts, not here.
 */
export const TIER_FLOOR: Readonly<Record<Exclude<Tier, 'daily'>, number>> = {
  performance: 0.08,
  super: 0.14,
  hyper: 0.2,
}

/** A car within this distance of a boundary may be placed by judgment, with a tierNote. */
export const TIER_JUDGMENT_MARGIN = 0.005

export const TIER_LABEL: Readonly<Record<Tier, string>> = {
  daily: 'Common',
  performance: 'Uncommon',
  super: 'Rare',
  hyper: 'Ultra Rare',
}

export function powerToWeight(hp: number, weightLb: number): number {
  return hp / weightLb
}

export function tierForRatio(ratio: number): Tier {
  if (ratio >= TIER_FLOOR.hyper) return 'hyper'
  if (ratio >= TIER_FLOOR.super) return 'super'
  if (ratio >= TIER_FLOOR.performance) return 'performance'
  return 'daily'
}

/**
 * True when `placed` is adjacent to the tier the ratio computes to and the ratio is within
 * TIER_JUDGMENT_MARGIN of the boundary between them.
 */
export function isJudgmentPlacement(ratio: number, placed: Tier): boolean {
  const computed = tierForRatio(ratio)
  if (computed === placed) return false
  const a = TIERS.indexOf(computed)
  const b = TIERS.indexOf(placed)
  if (Math.abs(a - b) !== 1) return false
  const upper = TIERS[Math.max(a, b)]
  if (upper === undefined || upper === 'daily') return false
  return Math.abs(ratio - TIER_FLOOR[upper]) <= TIER_JUDGMENT_MARGIN
}
