'use client'

// Canvas devices. A device only resizes the canvas. The Styles panel picks the breakpoint it edits
// on its own; the breakpoint the canvas shows always follows the frame width.
// "Fluid" (the default, canvas width `null`) fills the stage, so the canvas shows the breakpoint of
// the space the panels leave, and follows it while panels or the window resize.
// The other devices are fixed widths. A frame wider than the stage zooms out to fit.

import { MOBILE_WIDTH, TABLET_WIDTH } from './tokens'

export type Device = 'fluid' | 'desktop' | 'tablet' | 'mobile'

/** Narrowest width of the desktop frame (Tailwind's `xl`). */
export const DESKTOP_WIDTH = 1280

export const DEVICE_WIDTHS: Record<Device, number | null> = { fluid: null, desktop: DESKTOP_WIDTH, tablet: TABLET_WIDTH, mobile: MOBILE_WIDTH }

export function deviceForWidth(width: number | null): Device | null {
  if (width === null) return 'fluid'
  if (width === DESKTOP_WIDTH) return 'desktop'
  if (width === TABLET_WIDTH) return 'tablet'
  if (width === MOBILE_WIDTH) return 'mobile'
  return null
}

/** Narrowest and widest custom canvas widths. Wider frames zoom out to fit the stage. */
export const MIN_CANVAS_WIDTH = 320
export const MAX_CANVAS_WIDTH = 2560
