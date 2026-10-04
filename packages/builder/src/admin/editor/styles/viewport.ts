'use client'

// Canvas devices. A device only resizes the canvas. The Styles panel picks its breakpoint on its own.
// "Desktop" fills the stage, but never narrower than DESKTOP_WIDTH: on a laptop the frame zooms
// out to fit, so the canvas still shows the desktop layout and not the tablet one.

import { MOBILE_WIDTH, TABLET_WIDTH } from './tokens'

export type Device = 'desktop' | 'tablet' | 'mobile'

export const DEVICE_WIDTHS: Record<Device, number | null> = { desktop: null, tablet: TABLET_WIDTH, mobile: MOBILE_WIDTH }

export function deviceForWidth(width: number | null): Device | null {
  if (width === null) return 'desktop'
  if (width === TABLET_WIDTH) return 'tablet'
  if (width === MOBILE_WIDTH) return 'mobile'
  return null
}

/** Narrowest width of the desktop frame (Tailwind's `xl`). */
export const DESKTOP_WIDTH = 1280

/** Narrowest and widest custom canvas widths. Wider frames zoom out to fit the stage. */
export const MIN_CANVAS_WIDTH = 320
export const MAX_CANVAS_WIDTH = 2560
