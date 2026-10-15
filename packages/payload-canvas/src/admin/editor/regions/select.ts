'use client'

// Selecting page regions on the canvas. Pure parts first (no DOM), so the tests run in Node.

import type { CanvasMeasurement, Point } from '../../../core/types'
import { rectContains } from '../../../protocol'
import type { Runtime } from '../runtime'

/** Who owns an edit on the canvas: a block of the layout, or a region of the page frame. */
export type CanvasOwner = { id: string; region?: string }

/**
 * The region under a point (iframe viewport coordinates), or null. The smallest box wins, so a
 * region inside another one can still be picked. Points inside the layout outlet never count:
 * the layout's blocks own them.
 */
export function regionAt(measurement: CanvasMeasurement, point: Point): string | null {
  if (measurement.root && rectContains(measurement.root, point.x, point.y)) return null
  let best: { name: string; area: number } | null = null
  for (const { name, rect } of measurement.regions ?? []) {
    if (!rectContains(rect, point.x, point.y)) continue
    const area = rect.width * rect.height
    if (!best || area < best.area) best = { name, area }
  }
  return best?.name ?? null
}

/** Selects the owner of a canvas edit: the region, or the block. */
export function selectOwner(runtime: Runtime, owner: CanvasOwner) {
  if (owner.region && runtime.regions) {
    runtime.regions.selected.set(owner.region)
    return
  }
  runtime.regions?.selected.set(null)
  runtime.store.select(owner.id)
}

/** The key of an owner, for state that may belong to a block or a region (an upload in progress). */
export const ownerKey = (owner: CanvasOwner) => (owner.region ? `r:${owner.region}` : `b:${owner.id}`)
