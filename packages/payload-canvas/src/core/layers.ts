// Boxes over the page on the canvas (an open popup). The page's blocks lie under such a box, and
// the box's own blocks may be less deep in the layout than the page's. So over a box, the pointer
// must reach only the box's blocks. No DOM, no React.

import type { CanvasMeasurement, Point, Rect } from './types'

const contains = (r: Rect, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

/** The index of the top layer whose box holds the point, or -1. Later layers show above earlier ones. */
export function layerAt(measurement: CanvasMeasurement, p: Point): number {
  const layers = measurement.layers ?? []
  for (let i = layers.length - 1; i >= 0; i--) if (contains(layers[i]!.rect, p)) return i
  return -1
}

/**
 * The blocks and slots the pointer at `p` can reach. Over a layer: only those in it, and its
 * owner block with the layer's box (a click on the box's padding selects the popup). Elsewhere:
 * only those on the page. Without layers: the measurement itself.
 */
export function reachableAt(measurement: CanvasMeasurement, p: Point): CanvasMeasurement {
  const layers = measurement.layers
  if (!layers?.length) return measurement
  const index = layerAt(measurement, p)
  const inLayer = (item: { layer?: number }) => (index < 0 ? item.layer === undefined : item.layer === index)
  const blocks = measurement.blocks.filter(inLayer)
  const owner = index < 0 ? null : layers[index]!.ownerId
  if (owner && !blocks.some((b) => b.id === owner)) blocks.unshift({ id: owner, rect: layers[index]!.rect, layer: index })
  return { ...measurement, blocks, slots: measurement.slots.filter(inLayer) }
}
