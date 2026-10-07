// The canvas frame's resize handles: the width a drag gives. Pure, so it is easy to test.
// The frame stays centered, so a handle moves both edges: the width changes by twice the pointer
// distance. The zoom stays the same during a drag.

import { MAX_CANVAS_WIDTH, MIN_CANVAS_WIDTH } from '../styles/viewport'

/** With the snap key held, a width this close (in CSS px) to a breakpoint or device width jumps to it. */
export const SNAP_DISTANCE = 32

export type ResizeStart = {
  /** Frame width in CSS px when the drag started. */
  width: number
  /** The frame zoom: screen px per CSS px. */
  zoom: number
  /** The handle: -1 on the left edge, 1 on the right edge. */
  side: -1 | 1
  /** Widest frame on screen, in screen px (the stage). */
  space: number
}

/** The frame width for a pointer `dx` screen px from where the drag started. Snaps to `snap` widths when given. */
export function resizedWidth(start: ResizeStart, dx: number, snap: readonly number[] = []): number {
  const max = Math.max(MIN_CANVAS_WIDTH, Math.min(MAX_CANVAS_WIDTH, Math.floor(start.space / (start.zoom || 1))))
  const raw = start.width + (2 * start.side * dx) / (start.zoom || 1)
  let width = Math.round(Math.min(max, Math.max(MIN_CANVAS_WIDTH, raw)))
  let best = SNAP_DISTANCE
  for (const candidate of snap) {
    const distance = Math.abs(candidate - width)
    if (candidate >= MIN_CANVAS_WIDTH && candidate <= max && distance <= best) {
      best = distance
      width = candidate
    }
  }
  return width
}
