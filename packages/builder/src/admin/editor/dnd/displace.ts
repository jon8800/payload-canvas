// Smooth drag mode: where blocks and outline rows move while a block is dragged, so the drop
// position shows as a gap. Pure functions: no DOM, no React. They read the rects measured at the
// start of the drag and the drop target from `core/dropTarget.ts`, and never change the layout.

import { applyOperation } from '../../../core/operations'
import { DEFAULT_SLOT, indexLayout, type IndexedBlock } from '../../../core/tree'
import type { Axis, Block, CanvasMeasurement, DragSource, DropTarget, Layout, Point, Rect } from '../../../core/types'

/** Offset of each moved block or row, by id. A block's offset adds to its parent's. */
export type Offsets = Map<string, Point>

export type CanvasPreview = {
  offsets: Offsets
  /** The gap where the dragged block lands, in the measurement's coordinates (offsets included). */
  placeholder: Rect | null
}

/** Size of the gap for a new block from the library, along the list's axis. */
const NEW_BLOCK_SIZE = 56
/** The gap is at least this big and at most this big for a new block, along the list's axis. */
const MIN_GAP = 24
const MAX_NEW_GAP = 96
/** An empty slot keeps this height (the canvas placeholder). */
const EMPTY_SLOT = 48

type Item = { id: string; rect: Rect }
type List = { axis: Axis; wraps: boolean; items: Item[]; bounds: Rect | null }

const startOf = (r: Rect, axis: Axis) => (axis === 'x' ? r.x : r.y)
const sizeOf = (r: Rect, axis: Axis) => (axis === 'x' ? r.width : r.height)
const endOf = (r: Rect, axis: Axis) => startOf(r, axis) + sizeOf(r, axis)
const along = (axis: Axis, d: number): Point => (axis === 'x' ? { x: d, y: 0 } : { x: 0, y: d })
const cross = (axis: Axis): Axis => (axis === 'x' ? 'y' : 'x')

function add(offsets: Offsets, id: string, d: Point) {
  if (d.x === 0 && d.y === 0) return
  const current = offsets.get(id)
  offsets.set(id, current ? { x: current.x + d.x, y: current.y + d.y } : d)
}

/** Distance from an item's start to the next item's start. The last item: its size and the gap before it. */
function pitch(items: Item[], i: number, axis: Axis): number {
  if (i < items.length - 1) return startOf(items[i + 1].rect, axis) - startOf(items[i].rect, axis)
  const gapBefore = i > 0 ? Math.max(0, startOf(items[i].rect, axis) - endOf(items[i - 1].rect, axis)) : 0
  return sizeOf(items[i].rect, axis) + gapBefore
}

function averageGap(items: Item[], axis: Axis): number {
  if (items.length < 2) return 0
  let total = 0
  for (let i = 0; i < items.length - 1; i++) total += Math.max(0, startOf(items[i + 1].rect, axis) - endOf(items[i].rect, axis))
  return total / (items.length - 1)
}

function averageSize(items: Item[], axis: Axis): number {
  return items.reduce((sum, item) => sum + sizeOf(item.rect, axis), 0) / Math.max(1, items.length)
}

/** True when the items wrap onto more than one line (a grid, a wrapping flex row). */
function wraps(items: Item[], axis: Axis): boolean {
  if (items.length < 2) return false
  const other = cross(axis)
  const first = items[0].rect
  return items.some((item) => Math.abs(startOf(item.rect, other) - startOf(first, other)) > Math.min(sizeOf(item.rect, other), sizeOf(first, other)) / 2)
}

const onLine = (a: Rect | undefined, b: Rect | undefined) => Boolean(a && b && Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2)

/** A rect with `axis` start and size replaced. */
function boxAlong(axis: Axis, start: number, size: number, crossStart: number, crossSize: number): Rect {
  return axis === 'x' ? { x: start, y: crossStart, width: size, height: crossSize } : { x: crossStart, y: start, width: crossSize, height: size }
}

/** The cells of a wrapping list, plus one more after the last (where an added item would go). */
function cellsWithNext(list: List): Rect[] {
  const cells = list.items.map((item) => item.rect)
  const last = cells.at(-1)
  if (!last) return cells
  const prev = cells.at(-2)
  const right = list.bounds ? list.bounds.x + list.bounds.width : Infinity
  // Column step from the last two cells, else from the first two, else the cell width.
  const step = prev && onLine(prev, last) ? last.x - prev.x : onLine(cells[0], cells[1]) ? cells[1].x - cells[0].x : last.width
  if (last.x + step + last.width <= right + 1) return [...cells, { ...last, x: last.x + step }]
  const nextLine = cells.find((c) => c.y > cells[0].y + cells[0].height / 2)
  const lineStep = nextLine ? nextLine.y - cells[0].y : last.height
  return [...cells, { ...last, x: cells[0].x, y: last.y + lineStep }]
}

/**
 * Where the dragged block lands in the canvas, as offsets for the blocks that make room and the
 * gap it leaves. Lists along one axis shift by sizes (blocks may differ in size); wrapping lists
 * (grids) move each block into the cell of its neighbour. A list that grows or shrinks pushes the
 * blocks after its container, up through vertical lists.
 *
 * `measurement` holds the rects measured before the drag started (the canvas never reports
 * displaced rects). With no target, or a drop that changes nothing, nothing moves.
 */
export function canvasPreview(layout: Layout, measurement: CanvasMeasurement, source: DragSource, target: DropTarget | null): CanvasPreview {
  const rects = new Map(measurement.blocks.map((b) => [b.id, b.rect]))
  const sourceRect = source.kind === 'block' ? (rects.get(source.id) ?? null) : null
  const offsets: Offsets = new Map()
  if (!target || target.noop) return { offsets, placeholder: sourceRect }

  const index = indexLayout(layout)
  const slotRect = (ownerId: string, slot: string) => measurement.slots.find((s) => s.ownerId === ownerId && s.slot === slot)
  const listOf = (ownerId: string | null, slot: string): List | null => {
    const children: Block[] = ownerId === null ? layout.blocks : (index.get(ownerId)?.block.slots?.[slot] ?? [])
    const items: Item[] = []
    for (const child of children) {
      const rect = rects.get(child.id)
      if (!rect) return null
      items.push({ id: child.id, rect })
    }
    const axis = ownerId === null ? measurement.rootAxis : (slotRect(ownerId, slot)?.axis ?? 'y')
    const bounds = ownerId === null ? { x: 0, y: 0, width: measurement.viewport.width, height: measurement.documentHeight } : (slotRect(ownerId, slot)?.rect ?? rects.get(ownerId) ?? null)
    return { axis, wraps: wraps(items, axis), items, bounds }
  }

  /** A list that grows by `delta` (vertical lists only) pushes what follows its container. */
  const grow = (ownerId: string | null, delta: number) => {
    if (delta === 0) return
    let id = ownerId
    while (id !== null) {
      const entry: IndexedBlock | undefined = index.get(id)
      if (!entry) return
      const list = listOf(entry.parentId, entry.slot)
      if (!list || list.axis !== 'y' || list.wraps) return
      for (let i = entry.index + 1; i < list.items.length; i++) add(offsets, list.items[i].id, { x: 0, y: delta })
      id = entry.parentId
    }
  }

  const { parentId, index: to } = target.to
  const slot = target.to.slot ?? DEFAULT_SLOT
  const targetList = listOf(parentId, slot)
  if (!targetList) return { offsets, placeholder: sourceRect }
  const { axis } = targetList
  const sourceEntry = source.kind === 'block' ? index.get(source.id) : undefined
  const sameList = Boolean(sourceEntry && sourceEntry.parentId === parentId && sourceEntry.slot === slot)
  let placeholder: Rect | null

  if (sameList && sourceEntry && sourceRect) {
    const { items } = targetList
    const s = sourceEntry.index
    if (targetList.wraps) {
      const order: (string | null)[] = items.filter((_, i) => i !== s).map((item) => item.id)
      order.splice(to, 0, null)
      order.forEach((id, k) => {
        const item = id ? items.find((it) => it.id === id) : null
        if (item) add(offsets, item.id, { x: items[k].rect.x - item.rect.x, y: items[k].rect.y - item.rect.y })
      })
      placeholder = items[to].rect
    } else {
      const d = pitch(items, s, axis)
      let start: number
      if (to > s) {
        for (let i = s + 1; i <= to; i++) add(offsets, items[i].id, along(axis, -d))
        start = startOf(items[to].rect, axis) - d + pitch(items, to, axis)
      } else {
        for (let i = to; i < s; i++) add(offsets, items[i].id, along(axis, d))
        start = startOf(items[to].rect, axis)
      }
      const other = cross(axis)
      placeholder = boxAlong(axis, start, sizeOf(sourceRect, axis), startOf(sourceRect, other), sizeOf(sourceRect, other))
    }
  } else {
    // The source list closes the gap the block leaves.
    if (sourceEntry && sourceRect) {
      const list = listOf(sourceEntry.parentId, sourceEntry.slot)
      if (list) {
        const s = sourceEntry.index
        if (list.wraps) {
          for (let i = s + 1; i < list.items.length; i++) {
            const item = list.items[i]
            const cell = list.items[i - 1].rect
            add(offsets, item.id, { x: cell.x - item.rect.x, y: cell.y - item.rect.y })
          }
        } else {
          const d = pitch(list.items, s, list.axis)
          for (let i = s + 1; i < list.items.length; i++) add(offsets, list.items[i].id, along(list.axis, -d))
          if (list.axis === 'y') grow(sourceEntry.parentId, list.items.length === 1 ? Math.min(0, EMPTY_SLOT - d) : -d)
        }
      }
    }
    // The target list opens a gap.
    const { items } = targetList
    const other = cross(axis)
    if (items.length === 0) {
      placeholder = targetList.bounds
    } else if (targetList.wraps) {
      const cells = cellsWithNext(targetList)
      for (let i = to; i < items.length; i++) {
        const cell = cells[i + 1]
        add(offsets, items[i].id, { x: cell.x - items[i].rect.x, y: cell.y - items[i].rect.y })
      }
      const cell = cells[to]
      const size = items[Math.min(to, items.length - 1)].rect
      placeholder = { x: cell.x, y: cell.y, width: size.width, height: size.height }
    } else {
      const average = averageSize(items, axis)
      const size = sourceRect
        ? Math.max(MIN_GAP, Math.min(sizeOf(sourceRect, axis), Math.max(average, EMPTY_SLOT)))
        : Math.max(MIN_GAP, Math.min(average || NEW_BLOCK_SIZE, MAX_NEW_GAP))
      const gap = averageGap(items, axis)
      for (let i = to; i < items.length; i++) add(offsets, items[i].id, along(axis, size + gap))
      const start = to < items.length ? startOf(items[to].rect, axis) : endOf(items[items.length - 1].rect, axis) + gap
      const crossStart = Math.min(...items.map((item) => startOf(item.rect, other)))
      const crossEnd = Math.max(...items.map((item) => endOf(item.rect, other)))
      placeholder = boxAlong(axis, start, size, crossStart, crossEnd - crossStart)
      if (axis === 'y') grow(parentId, size + gap)
    }
  }

  if (source.kind === 'block') offsets.delete(source.id)
  return { offsets, placeholder: placeholder && shiftByAncestors(placeholder, parentId, index, offsets) }
}

/** The rect moved by the offsets of the block `ownerId` and its ancestors. */
function shiftByAncestors(rect: Rect, ownerId: string | null, index: Map<string, IndexedBlock>, offsets: Offsets): Rect {
  let x = rect.x
  let y = rect.y
  for (let id = ownerId; id !== null; id = index.get(id)?.parentId ?? null) {
    const d = offsets.get(id)
    if (d) {
      x += d.x
      y += d.y
    }
  }
  return { ...rect, x, y }
}

/** The measurement taken at the start of a drag, moved by how far the canvas scrolled since. */
export function scrolledMeasurement(base: CanvasMeasurement, scroll: Point): CanvasMeasurement {
  const dx = scroll.x - base.scroll.x
  const dy = scroll.y - base.scroll.y
  if (dx === 0 && dy === 0) return base
  const move = (r: Rect): Rect => ({ x: r.x - dx, y: r.y - dy, width: r.width, height: r.height })
  return {
    ...base,
    scroll,
    blocks: base.blocks.map((b) => ({ id: b.id, rect: move(b.rect) })),
    slots: base.slots.map((s) => ({ ...s, rect: move(s.rect) })),
  }
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

/** Id of the gap row for a new block (the library). Never a real block id. */
export const DROP_ROW = '\u0000drop'

/** An outline row: `top` is its offset from the top of the list's content. */
export type FlatRow = { id: string; depth: number; top: number; height: number }
export type RowOrder = { id: string; depth: number }[]

export type OutlinePreview = {
  /** Offsets of the rows. Rows of the dragged block's children follow it, hidden. */
  offsets: Offsets
  /** Rows of the dragged block's children (hidden while dragging). */
  hidden: string[]
  /** Where the dragged row (or the gap for a new block) sits. Null when the drop goes into a collapsed block. */
  gap: { top: number; depth: number; height: number } | null
}

/** Row order of the outline: depth first, children of collapsed blocks left out. */
export function rowOrder(layout: Layout, collapsed: ReadonlySet<string>): RowOrder {
  const out: RowOrder = []
  const visit = (blocks: Block[], depth: number) => {
    for (const block of blocks) {
      out.push({ id: block.id, depth })
      if (!collapsed.has(block.id)) visit(Object.values(block.slots ?? {}).flat(), depth + 1)
    }
  }
  visit(layout.blocks, 0)
  return out
}

/**
 * The outline's row order after the drop, with the dragged block collapsed (its children travel
 * inside it). A new block shows as the `DROP_ROW`. Null when the drop would not change the layout.
 */
export function previewRowOrder(layout: Layout, collapsed: ReadonlySet<string>, source: DragSource, target: DropTarget | null): RowOrder | null {
  if (!target || target.noop) return null
  const result =
    source.kind === 'block'
      ? applyOperation(layout, { type: 'move', id: source.id, to: target.to })
      : applyOperation(layout, { type: 'insert', block: { id: DROP_ROW, type: source.blockType }, to: target.to })
  if (!result.ok) return null
  const closed = source.kind === 'block' ? new Set([...collapsed, source.id]) : collapsed
  return rowOrder(result.layout, closed)
}

/** The dragged row's children rows: the rows right after it that are deeper. */
export function childRows(rows: FlatRow[], sourceId: string | null): string[] {
  const at = sourceId === null ? -1 : rows.findIndex((r) => r.id === sourceId)
  if (at < 0) return []
  const out: string[] = []
  for (let i = at + 1; i < rows.length && rows[i].depth > rows[at].depth; i++) out.push(rows[i].id)
  return out
}

/** The rows as they sit while dragging, before any drop target: the dragged row's children leave, rows below close up. */
export function liftRows(rows: FlatRow[], sourceId: string | null): FlatRow[] {
  const hidden = new Set(childRows(rows, sourceId))
  if (hidden.size === 0) return rows
  const out: FlatRow[] = []
  let removed = 0
  for (const row of rows) {
    if (hidden.has(row.id)) removed += row.height
    else out.push(removed ? { ...row, top: row.top - removed } : row)
  }
  return out
}

/**
 * Offsets that lay the rows out in `order` (the preview order), or in the lifted order when
 * `order` is null. Rows keep their measured heights; the gap for a new block takes the first
 * row's height. The dragged row also moves sideways to its new depth.
 */
export function outlinePreview(rows: FlatRow[], order: RowOrder | null, sourceId: string | null, indent: number): OutlinePreview {
  const base = new Map(rows.map((r) => [r.id, r]))
  const hidden = childRows(rows, sourceId)
  const hiddenSet = new Set(hidden)
  const sequence: RowOrder = order ?? rows.filter((r) => !hiddenSet.has(r.id)).map((r) => ({ id: r.id, depth: r.depth }))
  const rowHeight = rows[0]?.height ?? 28
  const placed = new Map<string, { top: number; depth: number; height: number }>()
  let top = rows[0]?.top ?? 0
  for (const { id, depth } of sequence) {
    const height = base.get(id)?.height ?? rowHeight
    placed.set(id, { top, depth, height })
    top += height
  }
  const gapId = sourceId ?? DROP_ROW
  const gap = placed.get(gapId) ?? null
  const offsets: Offsets = new Map()
  const sourceRow = sourceId ? base.get(sourceId) : undefined
  for (const row of rows) {
    const at = placed.get(row.id)
    if (at) {
      add(offsets, row.id, { x: row.id === sourceId ? (at.depth - row.depth) * indent : 0, y: at.top - row.top })
    } else if (hiddenSet.has(row.id) && sourceRow) {
      // Children slide under the dragged row.
      const to = placed.get(sourceRow.id)
      if (to) add(offsets, row.id, { x: 0, y: to.top - row.top })
    }
  }
  return { offsets, hidden, gap }
}

// ---------------------------------------------------------------------------
// The lifted copy
// ---------------------------------------------------------------------------

/** A copy shrunk below this is hard to read: the drag shows the compact card instead. */
export const MIN_COPY_SCALE = 0.6

/**
 * How much the canvas shrinks the lifted copy of a block of `size` (iframe pixels) at canvas
 * `zoom` so it fits `max` (screen pixels). Null when it would shrink below `MIN_COPY_SCALE`: a
 * large block (a full-width section) drags as the compact card, which the canvas edge cannot cut.
 */
export function copyScale(size: { width: number; height: number }, zoom: number, max: { width: number; height: number }): number | null {
  const width = size.width * zoom
  const height = size.height * zoom
  if (!(width > 0) || !(height > 0)) return null
  const scale = Math.min(1, max.width / width, max.height / height)
  return scale < MIN_COPY_SCALE ? null : scale
}
