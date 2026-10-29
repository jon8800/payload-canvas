'use client'

// Shared by the tabs block and its tab blocks. Its own module, so both lazy chunks get the same
// context.
import { createContext } from 'react'

export type TabsState = {
  /** The id of the block of the open tab. */
  active: string | null
  /** The id of a tab's button, by the tab block's id. */
  tabId: (blockId: string) => string
  /** The id of a tab's panel, by the tab block's id. */
  panelId: (blockId: string) => string
  /** The classes of the tabs block's `panel` part, for every panel. */
  panelClassName?: string
}

/** Set by the tabs block for the tab blocks in its slot. Null outside a tabs block. */
export const TabsContext = createContext<TabsState | null>(null)
