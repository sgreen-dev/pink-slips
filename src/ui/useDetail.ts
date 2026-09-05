import { useContext } from 'react'
import { DetailContext, type OpenDetail } from './detailContext.ts'

/** The card detail opener, or null where no panel is mounted, so a card renders as before. */
export function useDetail(): OpenDetail | null {
  return useContext(DetailContext)
}
