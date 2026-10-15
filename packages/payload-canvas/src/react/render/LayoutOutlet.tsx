'use client'

import { createContext, useContext, type ReactNode } from 'react'

/** Canvas only. The live layout the canvas renders. `BuilderCanvas` provides it around the page frame. */
export const LayoutOutletContext = createContext<ReactNode>(null)

/**
 * Stands in for the layout in the page frame the canvas server action renders. The canvas fills
 * it with the layout it renders itself, so every block stays live: selectable, draggable and
 * edited in place, with no request to the server.
 */
export function LayoutOutlet(): ReactNode {
  return useContext(LayoutOutletContext)
}
