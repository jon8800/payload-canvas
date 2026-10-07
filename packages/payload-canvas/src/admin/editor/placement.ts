// Where floating editor UI goes on the canvas, in iframe viewport coordinates. Pure, so it is tested.

import type { CanvasMeasurement, Layout, Rect } from '../../core/types'
import { walkBlocks } from '../../core'
import { childrenOf } from './names'

export type Size = { width: number; height: number }

export type ToolbarPlacement = {
  /** `inside`: neither above nor below fits in the viewport; the toolbar sits at the top of what is visible. */
  place: 'above' | 'below' | 'inside'
  left: number
  top: number
}

function overlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return width > 0 && height > 0 ? width * height : 0
}

/**
 * Places a toolbar of `size` next to `target`: above or below it, whichever covers less of the
 * `obstacles` (other content on the canvas). A tie goes above. It stays inside the viewport; when
 * neither side fits, it goes inside the target, at the top of the visible part.
 */
export function placeToolbar(target: Rect, size: Size, viewport: Size, obstacles: readonly Rect[], gap: number): ToolbarPlacement {
  const left = Math.max(0, Math.min(target.x, viewport.width - size.width))
  const candidates: ToolbarPlacement[] = []
  const above = target.y - gap - size.height
  if (above >= 0) candidates.push({ place: 'above', left, top: above })
  const below = target.y + target.height + gap
  if (below + size.height <= viewport.height) candidates.push({ place: 'below', left, top: below })
  if (candidates.length === 0) return { place: 'inside', left, top: Math.max(0, target.y) + gap }
  const cost = (c: ToolbarPlacement) => {
    const box = { x: c.left, y: c.top, width: size.width, height: size.height }
    return obstacles.reduce((sum, rect) => sum + overlapArea(box, rect), 0)
  }
  let best = candidates[0]
  for (const candidate of candidates.slice(1)) if (cost(candidate) < cost(best)) best = candidate
  return best
}

/**
 * Rects of the blocks that show content (blocks without children), except `id` and its own
 * children. Containers are left out: their background is not content worth keeping visible.
 */
export function contentRects(layout: Layout, measurement: CanvasMeasurement, id: string): Rect[] {
  const leaves = new Set<string>()
  walkBlocks(layout, (block) => {
    // The edited block and what is inside it are the target, not obstacles.
    if (block.id === id) return false
    if (childrenOf(block).length === 0) leaves.add(block.id)
  })
  return measurement.blocks.filter((b) => leaves.has(b.id)).map((b) => b.rect)
}
