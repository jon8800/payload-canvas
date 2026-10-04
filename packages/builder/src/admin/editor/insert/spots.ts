// Where the canvas "+" button goes: between blocks (on the edge nearest the pointer) or inside an
// empty slot. Pure: no DOM, no React. Coordinates are iframe viewport coordinates, like the
// measurement. Slot rules count: a spot is offered only where at least one block type fits.

import { deepestBlockAt } from '../../../core/dropTarget'
import { getBlockDefinition, placementError, slotNames } from '../../../core/blocks'
import { DEFAULT_SLOT, indexLayout, type IndexedBlock } from '../../../core/tree'
import type { Axis, BlockDefinition, CanvasMeasurement, Layout, Point, Position, Rect } from '../../../core/types'

export type InsertSpot = {
  parentId: string | null
  slot: string
  /** Final index of the inserted block in the slot's list. */
  index: number
  /** `between`: on the edge between two blocks. `empty`: inside an empty slot (or an empty page). */
  kind: 'between' | 'empty'
  /** The axis the list flows along. The "+" sits on a horizontal line for `y`, a vertical one for `x`. */
  axis: Axis
  /** Center of the "+" button. */
  at: Point
  /** The edge line (`between`) or the empty slot (`empty`) to highlight. */
  rect: Rect
}

/** Default edge band of a container: near its edge the spot is before or after the container itself. */
export const EDGE_BAND = 12
const LINE = 2
/** Height of the empty page's spot area. */
const EMPTY_PAGE_HEIGHT = 120

export type InsertSpotOptions = {
  /** Width of a container's edge band, in iframe pixels. Default EDGE_BAND. */
  band?: number
}

export function spotPosition(spot: Pick<InsertSpot, 'parentId' | 'slot' | 'index'>): Position {
  return { parentId: spot.parentId, slot: spot.slot, index: spot.index }
}

/** True when two spots put the "+" at the same place for the same position. */
export function sameSpot(a: InsertSpot | null, b: InsertSpot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.parentId === b.parentId &&
    a.slot === b.slot &&
    a.index === b.index &&
    a.kind === b.kind &&
    Math.round(a.at.x) === Math.round(b.at.x) &&
    Math.round(a.at.y) === Math.round(b.at.y) &&
    Math.round(a.rect.width) === Math.round(b.rect.width) &&
    Math.round(a.rect.height) === Math.round(b.rect.height)
  )
}

function contains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
}

function distance(rect: Rect, p: Point): number {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

const center = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.x + rect.width / 2 : rect.y + rect.height / 2)
const start = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.x : rect.y)
const end = (rect: Rect, axis: Axis) => (axis === 'x' ? rect.x + rect.width : rect.y + rect.height)

/** The layout index of the last layout asked about. Pointer moves ask many times per layout. */
let cached: { layout: Layout; index: Map<string, IndexedBlock> } | null = null
function indexOf(layout: Layout): Map<string, IndexedBlock> {
  if (cached?.layout !== layout) cached = { layout, index: indexLayout(layout) }
  return cached.index
}

/**
 * The spot for a pointer at `p`:
 * 1. Over no block: the empty page, or before/after the nearest top-level block.
 * 2. In the edge band of a container (on its list's axis): before/after the container.
 * 3. In an empty slot of the block under the pointer: inside it.
 * 4. In a filled slot, between children: before/after the nearest child.
 * 5. Otherwise: before/after the block under the pointer, by the pointer's side of its center.
 * A spot whose list accepts no block type moves up to the parent block, and so on.
 */
export function insertSpotAt(
  layout: Layout,
  blocks: BlockDefinition[],
  measurement: CanvasMeasurement,
  p: Point,
  options: InsertSpotOptions = {},
): InsertSpot | null {
  const band = options.band ?? EDGE_BAND
  const index = indexOf(layout)
  const rects = new Map(measurement.blocks.map((b) => [b.id, b.rect]))
  const slotRect = (ownerId: string, slot: string) => measurement.slots.find((s) => s.ownerId === ownerId && s.slot === slot)
  const axisOf = (ownerId: string | null, slot: string): Axis =>
    ownerId === null ? measurement.rootAxis : (slotRect(ownerId, slot)?.axis ?? 'y')
  const listOf = (ownerId: string | null, slot: string) =>
    ownerId === null ? layout.blocks : (index.get(ownerId)?.block.slots?.[slot] ?? [])
  const acceptsAny = (ownerId: string | null, slot: string) =>
    ownerId === null || blocks.some((def) => placementError(blocks, layout, ownerId, slot, def.type, index) === null)

  /** The spot before (`i`) or after (`i + 1`) child `i` of a list, centered in the gap to its neighbor. */
  const between = (ownerId: string | null, slot: string, i: number, side: 'before' | 'after'): InsertSpot | null => {
    if (!acceptsAny(ownerId, slot)) return null
    const list = listOf(ownerId, slot)
    const axis = axisOf(ownerId, slot)
    const at = side === 'before' ? i : i + 1
    const prev = rects.get(list[at - 1]?.id ?? '')
    const next = rects.get(list[at]?.id ?? '')
    const own = rects.get(list[i]?.id ?? '')
    if (!own) return null
    // On the list's axis: the middle of the gap, or the edge when there is no neighbor.
    let pos = side === 'before' ? start(own, axis) : end(own, axis)
    if (prev && next) pos = (end(prev, axis) + start(next, axis)) / 2
    // Across the axis: the extent of the block(s) the line touches.
    const cross = [prev, next].filter((r): r is Rect => Boolean(r))
    const lo = Math.min(...cross.map((r) => (axis === 'y' ? r.x : r.y)))
    const hi = Math.max(...cross.map((r) => (axis === 'y' ? r.x + r.width : r.y + r.height)))
    const rect: Rect =
      axis === 'y'
        ? { x: lo, y: pos - LINE / 2, width: hi - lo, height: LINE }
        : { x: pos - LINE / 2, y: lo, width: LINE, height: hi - lo }
    return {
      parentId: ownerId,
      slot,
      index: at,
      kind: 'between',
      axis,
      at: axis === 'y' ? { x: (lo + hi) / 2, y: pos } : { x: pos, y: (lo + hi) / 2 },
      rect,
    }
  }

  /** Before or after `entry`, by the pointer's side of its center. Climbs up while a list accepts nothing. */
  const around = (entry: IndexedBlock | undefined): InsertSpot | null => {
    for (let e = entry; e; e = e.parentId === null ? undefined : index.get(e.parentId)) {
      const rect = rects.get(e.block.id)
      if (!rect) continue
      const axis = axisOf(e.parentId, e.slot)
      const spot = between(e.parentId, e.slot, e.index, p[axis] < center(rect, axis) ? 'before' : 'after')
      if (spot) return spot
    }
    return null
  }

  /** Before or after the child of the list nearest to the pointer. */
  const nearestChild = (ownerId: string | null, slot: string): InsertSpot | null => {
    const list = listOf(ownerId, slot)
    let best: { i: number; d: number; rect: Rect } | null = null
    for (let i = 0; i < list.length; i++) {
      const rect = rects.get(list[i].id)
      if (!rect) continue
      const d = distance(rect, p)
      if (!best || d < best.d) best = { i, d, rect }
    }
    if (!best) return null
    const axis = axisOf(ownerId, slot)
    return between(ownerId, slot, best.i, p[axis] < center(best.rect, axis) ? 'before' : 'after')
  }

  if (layout.blocks.length === 0) {
    const rect = { x: 0, y: 0, width: measurement.viewport.width, height: EMPTY_PAGE_HEIGHT }
    return { parentId: null, slot: DEFAULT_SLOT, index: 0, kind: 'empty', axis: measurement.rootAxis, at: { x: rect.width / 2, y: rect.height / 2 }, rect }
  }

  const hitId = deepestBlockAt(layout, measurement, p)
  const hit = hitId ? index.get(hitId) : undefined
  if (!hit) return nearestChild(null, DEFAULT_SLOT)

  const names = slotNames(getBlockDefinition(blocks, hit.block.type))
  const hitRect = rects.get(hit.block.id)
  if (names.length > 0 && hitRect) {
    // 2. The container's own edge: before or after the container.
    const axis = axisOf(hit.parentId, hit.slot)
    const size = axis === 'x' ? hitRect.width : hitRect.height
    const zone = Math.min(band, size * 0.2)
    const offset = p[axis] - start(hitRect, axis)
    if (offset < zone || offset > size - zone) {
      const spot = around(hit)
      if (spot) return spot
    }
    for (const name of names) {
      const slot = slotRect(hit.block.id, name)
      const children = hit.block.slots?.[name] ?? []
      // 3. An empty slot under the pointer (its placeholder), or the only slot of an empty container.
      if (children.length === 0 && (slot ? contains(slot.rect, p) : names.length === 1) && acceptsAny(hit.block.id, name)) {
        const rect = slot?.rect ?? hitRect
        return {
          parentId: hit.block.id,
          slot: name,
          index: 0,
          kind: 'empty',
          axis: slot?.axis ?? 'y',
          at: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          rect,
        }
      }
      // 4. A filled slot under the pointer: between its children.
      if (children.length > 0 && slot && contains(slot.rect, p)) {
        const spot = nearestChild(hit.block.id, name)
        if (spot) return spot
      }
    }
  }
  // 5. Before or after the block itself.
  return around(hit)
}
