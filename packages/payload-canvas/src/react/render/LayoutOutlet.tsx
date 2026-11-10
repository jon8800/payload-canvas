'use client'

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'

import { LAYOUT_ROOT_ATTRIBUTE } from './regions'

/** Canvas only. The live layout's blocks the canvas renders. `BuilderCanvas` provides them around the page frame. */
export const LayoutOutletContext = createContext<ReactNode>(null)
/** Mount notifications include outlets that appear later through Suspense. */
export const LayoutOutletPresence = createContext<(() => () => void) | null>(null)

/**
 * Stands in for the layout in the page frame the canvas server action renders. The canvas fills
 * it with the layout it renders itself, so every block stays live: selectable, draggable and
 * edited in place, with no request to the server. The blocks sit in one `div` (the layout's box);
 * `className` styles it, for example `flex flex-wrap gap-4` when the page puts the blocks in a
 * flex row. Without it the box is a plain block.
 */
export function LayoutOutlet({ className }: { className?: string } = {}): ReactNode {
  const register = useContext(LayoutOutletPresence)
  useLayoutEffect(() => register?.(), [register])
  const content = useContext(LayoutOutletContext)
  return (
    <div {...{ [LAYOUT_ROOT_ATTRIBUTE]: '' }} className={className || undefined}>
      {content}
    </div>
  )
}
