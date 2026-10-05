'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Canvas only. The children the canvas rendered for each slot of a block that renders on the
 * server. `ServerBlock` provides it around the server output.
 */
export const PreviewSlotsContext = createContext<Record<string, ReactNode> | null>(null)

/**
 * Stands in for one slot's children in a block the canvas renders on the server. The server
 * output holds this element where the component puts the slot. In the canvas it renders the
 * children the canvas rendered itself, so they keep their block ids and update at once.
 */
export function SlotOutlet({ name }: { readonly name: string }): ReactNode {
  const slots = useContext(PreviewSlotsContext)
  return slots?.[name] ?? null
}
