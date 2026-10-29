'use client'

// Where a block renders: on the site, on the editor's canvas, or in the hidden renderer of the
// section thumbnails. Custom block components read it with `useCanvasMode()`.

import { createContext, useContext } from 'react'

/**
 * - `'site'`: the live website (also any page without the canvas around it).
 * - `'canvas'`: the editor's canvas iframe.
 * - `'thumbnail'`: the hidden canvas that takes the pictures of the section library (`?mode=thumbnail`).
 */
export type CanvasMode = 'site' | 'canvas' | 'thumbnail'

/** `BuilderCanvas` provides it. Without a provider (the site) the mode is `'site'`. */
export const CanvasModeContext = createContext<CanvasMode>('site')

/**
 * Where the block renders: `'site'`, `'canvas'` or `'thumbnail'`. For client components. A server
 * component gets the same value as its `canvasMode` prop (see `BlockComponentProps`).
 */
export function useCanvasMode(): CanvasMode {
  return useContext(CanvasModeContext)
}
