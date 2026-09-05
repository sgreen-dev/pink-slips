import { createContext } from 'react'

/** What the card detail panel can show. */
export type DetailTarget = { kind: 'car'; id: string } | { kind: 'mod'; id: string }

export type OpenDetail = (target: DetailTarget) => void

/** The opener the panel's provider hands to every card; null where no panel is mounted. */
export const DetailContext = createContext<OpenDetail | null>(null)
