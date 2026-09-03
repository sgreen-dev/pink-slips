import { createContext, useContext } from 'react'
import { bestVariant, type Variant, type VariantCounts } from '../collection/collection.ts'

/** Which finish to draw for a card id. Cards read it when they are not told one directly. */
export type VariantLookup = (id: string) => Variant

export const BASE_ONLY: VariantLookup = () => 'base'

export const VariantContext = createContext<VariantLookup>(BASE_ONLY)

export function lookupFrom(counts: VariantCounts): VariantLookup {
  return (id) => bestVariant(counts, id)
}

/** An explicit variant wins; otherwise the nearest provider decides, and the default is base. */
export function useVariant(id: string, explicit?: Variant): Variant {
  const lookup = useContext(VariantContext)
  return explicit ?? lookup(id)
}
