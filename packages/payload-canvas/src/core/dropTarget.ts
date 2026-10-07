// Pure drop-target logic. Given the layout, measured rectangles and a pointer position,
// it returns where a dragged block would land and where to draw the drop indicator.
// Coordinates are whatever space the rects are in (iframe viewport for the canvas,
// admin client coordinates for the outline). No DOM, no React.
//
// Slot rules: a slot whose `allow` list rejects the dragged type, that holds its `max` already, or whose `disallow` list (or an
// ancestor slot's) refuses any type inside the dragged block, is never a target.
// The functions then fall through to the next valid option (see each function).
// The root list accepts every type without a `parents` rule (a list item goes only in a list).

import { getBlockDefinition, placementError, slotNames } from './blocks'
import { DEFAULT_SLOT, indexLayout, subtreeIds, type IndexedBlock } from './tree'
import type {
  Axis,
  BlockDefinition,
  CanvasMeasurement,
  DragSource,
  DropIndicator,
  DropTarget,
  Layout,
  OutlineRow,
  Point,
  Rect,
} from './types'

const LINE = 4
const EDGE_ZONE = 12

type Index = Map<string, IndexedBlock>

function rectContains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height
}

function center(rect: Rect, axis: Axis): number {
  return axis === 'x' ? rect.x + rect.width / 2 : rect.y + rect.height / 2
}

function distance(rect: Rect, p: Point): number {
  const dx = Math.max(rect.x - p.x, 0, p.x - (rect.x + rect.width))
  const dy = Math.max(rect.y - p.y, 0, p.y - (rect.y + rect.height))
  return Math.hypot(dx, dy)
}

function edgeLine(rect: Rect, axis: Axis, side: 'before' | 'after'): Rect {
  if (axis === 'y') {
    const y = side === 'before' ? rect.y : rect.y + rect.height
    return { x: rect.x, y: y - LINE / 2, width: rect.width, height: LINE }
  }
  const x = side === 'before' ? rect.x : rect.x + rect.width
  return { x: x - LINE / 2, y: rect.y, width: LINE, height: rect.height }
}

/** Ids of the dragged block and everything inside it. These can never be drop parents. */
function excludedIds(index: Index, source: DragSource): Set<string> {
  if (source.kind !== 'block') return new Set()
  const entry = index.get(source.id)
  return new Set(entry ? subtreeIds(entry.block) : [])
}

function draggedType(index: Index, source: DragSource): string | null {
  if (source.kind === 'new') return source.blockType
  return index.get(source.id)?.block.type ?? null
}

/** Shared context: the layout index, block definitions and the dragged type. */
function context(layout: Layout, blocks: BlockDefinition[], source: DragSource) {
  const index = indexLayout(layout)
  const type = draggedType(index, source)
  const excluded = excludedIds(index, source)
  const slotsOf = (entry: IndexedBlock) => slotNames(getBlockDefinition(blocks, entry.block.type))
  const dragged = source.kind === 'block' ? (index.get(source.id)?.block ?? type) : type
  const accepts = (ownerId: string | null, slot: string): boolean => {
    if (type === null || dragged === null) return false
    if (ownerId === null) return slot === DEFAULT_SLOT && placementError(blocks, layout, null, slot, dragged, index) === null
    const owner = index.get(ownerId)
    const def = owner ? getBlockDefinition(blocks, owner.block.type) : undefined
    if (!def?.slots?.[slot]) return false
    return placementError(blocks, layout, ownerId, slot, dragged, index) === null
  }
  const parentOf = (entry: IndexedBlock) => (entry.parentId === null ? null : (index.get(entry.parentId) ?? null))
  return { index, type, excluded, slotsOf, accepts, parentOf }
}

/** Converts a raw index (counted before the dragged block leaves) into a final index. */
function finalize(
  index: Index,
  source: DragSource,
  parentId: string | null,
  slot: string,
  rawIndex: number,
  indicator: DropIndicator,
): DropTarget {
  let finalIndex = rawIndex
  let noop = false
  if (source.kind === 'block') {
    const current = index.get(source.id)
    if (current && current.parentId === parentId && current.slot === slot) {
      if (current.index < rawIndex) finalIndex = rawIndex - 1
      noop = finalIndex === current.index
    }
  }
  return { to: { parentId, slot, index: finalIndex }, indicator, noop }
}

function childrenOf(layout: Layout, index: Index, parentId: string | null, slot: string) {
  if (parentId === null) return layout.blocks
  return index.get(parentId)?.block.slots?.[slot] ?? []
}

function deepestEntry(
  index: Index,
  measurement: CanvasMeasurement,
  p: Point,
  excluded: Set<string>,
): IndexedBlock | null {
  let hit: IndexedBlock | null = null
  let hitArea = Infinity
  for (const { id, rect } of measurement.blocks) {
    if (excluded.has(id) || !rectContains(rect, p)) continue
    const entry = index.get(id)
    if (!entry) continue
    const area = rect.width * rect.height
    if (!hit || entry.depth > hit.depth || (entry.depth === hit.depth && area < hitArea)) {
      hit = entry
      hitArea = area
    }
  }
  return hit
}

/** The deepest block whose rect contains the point. Ties go to the smaller rect. */
export function deepestBlockAt(
  layout: Layout,
  measurement: CanvasMeasurement,
  p: Point,
  excluded?: Set<string>,
): string | null {
  return deepestEntry(indexLayout(layout), measurement, p, excluded ?? new Set())?.block.id ?? null
}

/**
 * Where a dragged block lands on the canvas. Respects slot `allow` rules from `blocks`.
 * 1. Find the deepest block under the pointer, skipping the dragged block and its descendants.
 * 2. Near the edge of a container (on its parent's axis): before/after the container.
 * 3. Inside a container: into the slot under the pointer (or the first slot that accepts the
 *    type), between the nearest children, or into the empty slot.
 * 4. On a leaf block, or a container with no accepting slot: before/after it, by the pointer's
 *    side of its center. If its list rejects the type, try its parent, then grandparent, and so on.
 * 5. Over no block: into the root list.
 */
export function canvasDropTarget(
  layout: Layout,
  blocks: BlockDefinition[],
  measurement: CanvasMeasurement,
  p: Point,
  source: DragSource,
): DropTarget | null {
  const { index, type, excluded, slotsOf, accepts, parentOf } = context(layout, blocks, source)
  if (type === null) return null
  const rects = new Map(measurement.blocks.map((b) => [b.id, b.rect]))
  const slotRect = (ownerId: string, slot: string) =>
    measurement.slots.find((s) => s.ownerId === ownerId && s.slot === slot)
  const axisOf = (ownerId: string | null, slot: string): Axis =>
    ownerId === null ? measurement.rootAxis : (slotRect(ownerId, slot)?.axis ?? 'y')

  const beforeAfter = (entry: IndexedBlock): DropTarget | null => {
    const rect = rects.get(entry.block.id)
    if (!rect) return null
    const axis = axisOf(entry.parentId, entry.slot)
    const side = p[axis] < center(rect, axis) ? 'before' : 'after'
    const raw = side === 'before' ? entry.index : entry.index + 1
    return finalize(index, source, entry.parentId, entry.slot, raw, { kind: 'line', rect: edgeLine(rect, axis, side) })
  }

  /** Before/after the entry, or the nearest ancestor whose list accepts the dragged type. */
  const around = (entry: IndexedBlock): DropTarget | null => {
    for (let e: IndexedBlock | null = entry; e; e = parentOf(e)) {
      if (accepts(e.parentId, e.slot)) return beforeAfter(e)
    }
    return null
  }

  const betweenChildren = (ownerId: string | null, slot: string): DropTarget | null => {
    const axis = axisOf(ownerId, slot)
    let nearest: { i: number; rect: Rect; d: number } | null = null
    const children = childrenOf(layout, index, ownerId, slot)
    for (let i = 0; i < children.length; i++) {
      const rect = rects.get(children[i].id)
      if (!rect || excluded.has(children[i].id)) continue
      const d = distance(rect, p)
      if (!nearest || d < nearest.d) nearest = { i, rect, d }
    }
    if (!nearest) return null
    const { i, rect } = nearest
    const side = p[axis] < center(rect, axis) ? 'before' : 'after'
    const raw = side === 'before' ? i : i + 1
    return finalize(index, source, ownerId, slot, raw, { kind: 'line', rect: edgeLine(rect, axis, side) })
  }

  const intoSlot = (owner: IndexedBlock, slot: string): DropTarget | null => {
    const id = owner.block.id
    const children = owner.block.slots?.[slot] ?? []
    const visible = children.filter((c) => !excluded.has(c.id))
    if (visible.length > 0) {
      const between = betweenChildren(id, slot)
      if (between) return between
    }
    const rect = slotRect(id, slot)?.rect ?? rects.get(id)
    if (!rect) return null
    // When only the dragged block is in this slot, raw index 0 makes the drop a no-op.
    return finalize(index, source, id, slot, visible.length === 0 ? 0 : children.length, { kind: 'box', rect })
  }

  const hit = deepestEntry(index, measurement, p, excluded)
  if (!hit) {
    if (!accepts(null, DEFAULT_SLOT)) return null
    if (layout.blocks.length === 0) {
      return finalize(index, source, null, DEFAULT_SLOT, 0, {
        kind: 'box',
        rect: { x: 0, y: 0, width: measurement.viewport.width, height: 80 },
      })
    }
    return betweenChildren(null, DEFAULT_SLOT)
  }

  const open = slotsOf(hit).filter((name) => accepts(hit.block.id, name))
  if (open.length === 0) return around(hit)

  // Container: an edge band on the parent's axis drops before/after the container itself.
  const hitRect = rects.get(hit.block.id)
  if (hitRect && accepts(hit.parentId, hit.slot)) {
    const axis = axisOf(hit.parentId, hit.slot)
    const start = axis === 'x' ? hitRect.x : hitRect.y
    const size = axis === 'x' ? hitRect.width : hitRect.height
    const zone = Math.min(EDGE_ZONE, size * 0.2)
    const offset = p[axis] - start
    if (offset < zone || offset > size - zone) return beforeAfter(hit)
  }

  const slot =
    open.find((name) => {
      const s = slotRect(hit.block.id, name)
      return s ? rectContains(s.rect, p) : false
    }) ?? open[0]
  return intoSlot(hit, slot) ?? around(hit)
}

/**
 * Where a dragged block lands in the outline tree. Respects slot `allow` rules from `blocks`.
 * Leaf rows: top half before, bottom half after.
 * Container rows: top 30% before, middle inside (appended to the first accepting slot),
 * bottom 30% first child (or after the row when the container is empty).
 * When the preferred option is not allowed, the next one is tried; `null` when none fits.
 * Below the last row: appended to the root list.
 */
export function outlineDropTarget(
  layout: Layout,
  blocks: BlockDefinition[],
  rows: OutlineRow[],
  p: Point,
  source: DragSource,
  indent: number,
): DropTarget | null {
  const { index, type, excluded, slotsOf, accepts } = context(layout, blocks, source)
  if (type === null) return null
  const line = (r: OutlineRow, side: 'before' | 'after', depth: number): DropIndicator => {
    const y = side === 'before' ? r.rect.y : r.rect.y + r.rect.height
    return {
      kind: 'line',
      rect: { x: r.rect.x + depth * indent, y: y - 1, width: r.rect.width - depth * indent, height: 2 },
    }
  }

  const row = rows.find((r) => p.y >= r.rect.y && p.y <= r.rect.y + r.rect.height)
  if (!row) {
    const last = rows.at(-1)
    if (!last || p.y < last.rect.y || !accepts(null, DEFAULT_SLOT)) return null
    return finalize(index, source, null, DEFAULT_SLOT, layout.blocks.length, line(last, 'after', 0))
  }
  if (excluded.has(row.id)) return null
  const entry = index.get(row.id)
  if (!entry) return null

  const id = entry.block.id
  const offset = (p.y - row.rect.y) / row.rect.height
  const beside = (side: 'before' | 'after'): DropTarget | null => {
    if (!accepts(entry.parentId, entry.slot)) return null
    const raw = side === 'before' ? entry.index : entry.index + 1
    return finalize(index, source, entry.parentId, entry.slot, raw, line(row, side, row.depth))
  }

  const names = slotsOf(entry)
  if (names.length === 0) return beside(offset < 0.5 ? 'before' : 'after')

  const countOf = (slot: string) => entry.block.slots?.[slot]?.length ?? 0
  const inside = (): DropTarget | null => {
    const slot = names.find((name) => accepts(id, name))
    if (!slot) return null
    return finalize(index, source, id, slot, countOf(slot), { kind: 'box', rect: row.rect })
  }
  // The row after an open container is the first child of its first non-empty slot.
  const firstChild = (): DropTarget | null => {
    const slot = names.find((name) => countOf(name) > 0)
    if (!slot || !accepts(id, slot)) return null
    return finalize(index, source, id, slot, 0, line(row, 'after', row.depth + 1))
  }

  if (offset < 0.3) return beside('before') ?? inside()
  if (offset <= 0.7) return inside() ?? beside(offset < 0.5 ? 'before' : 'after')
  const hasChildren = names.some((name) => countOf(name) > 0)
  return (hasChildren ? firstChild() : beside('after')) ?? inside()
}
