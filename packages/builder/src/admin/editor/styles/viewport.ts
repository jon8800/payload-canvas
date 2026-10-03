'use client'

// Links the Styles panel breakpoint and the canvas width (toolbar devices).

import type { Breakpoint } from '../../../core'
import type { EditorStore } from '../store'
import { breakpointAt, canvasWidthFor, MOBILE_WIDTH, TABLET_WIDTH } from './tokens'

export type Device = 'desktop' | 'tablet' | 'mobile'

export const DEVICE_WIDTHS: Record<Device, number | null> = { desktop: null, tablet: TABLET_WIDTH, mobile: MOBILE_WIDTH }

export function deviceForWidth(width: number | null): Device | null {
  if (width === null) return 'desktop'
  if (width === TABLET_WIDTH) return 'tablet'
  if (width === MOBILE_WIDTH) return 'mobile'
  return null
}

type Widths = Record<Breakpoint, number>

/** Edits `bp` and resizes the canvas to its minimum width. */
export function selectBreakpoint(store: EditorStore, widths: Widths, bp: Breakpoint) {
  store.setCanvasWidth(canvasWidthFor(widths, bp))
  store.setVariant({ ...store.getState().variant, breakpoint: bp })
}

/** Resizes the canvas and edits the largest breakpoint that applies at the new width. */
export function selectDevice(store: EditorStore, widths: Widths, device: Device, stageWidth: number) {
  const width = DEVICE_WIDTHS[device]
  store.setCanvasWidth(width)
  store.setVariant({ ...store.getState().variant, breakpoint: breakpointAt(widths, width ?? stageWidth) })
}
