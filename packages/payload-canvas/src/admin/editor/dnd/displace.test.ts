import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasDropTarget } from '../../../core/dropTarget'
import type { BlockDefinition, CanvasMeasurement, DropTarget, Layout, Rect } from '../../../core/types'
import { flipFrom, isStill, springAt, springEasing } from '../../../protocol/motion'
import {
  canvasPreview,
  childRows,
  copyScale,
  DROP_ROW,
  liftRows,
  outlinePreview,
  previewRowOrder,
  rowOrder,
  scrolledMeasurement,
  type FlatRow,
} from './displace'

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height })
const target = (parentId: string | null, slot: string, index: number, noop = false): DropTarget => ({
  to: { parentId, slot, index },
  indicator: { kind: 'line', rect: rect(0, 0, 0, 0) },
  noop,
})

// Root: a, b, c stacked (100 high, 10 apart), then a stack s with x and y, then a 3-column grid g.
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'a', type: 'text' },
    { id: 'b', type: 'text' },
    { id: 'c', type: 'text' },
    { id: 's', type: 'stack', slots: { children: [{ id: 'x', type: 'text' }, { id: 'y', type: 'text' }] } },
    {
      id: 'g',
      type: 'grid',
      slots: { children: ['g1', 'g2', 'g3', 'g4'].map((id) => ({ id, type: 'text' })) },
    },
    { id: 'z', type: 'text' },
  ],
}

const measurement: CanvasMeasurement = {
  blocks: [
    { id: 'a', rect: rect(0, 0, 800, 100) },
    { id: 'b', rect: rect(0, 110, 800, 100) },
    { id: 'c', rect: rect(0, 220, 800, 100) },
    { id: 's', rect: rect(0, 330, 800, 120) },
    { id: 'x', rect: rect(0, 330, 800, 50) },
    { id: 'y', rect: rect(0, 390, 800, 50) },
    { id: 'g', rect: rect(0, 460, 800, 200) },
    { id: 'g1', rect: rect(0, 460, 260, 90) },
    { id: 'g2', rect: rect(270, 460, 260, 90) },
    { id: 'g3', rect: rect(540, 460, 260, 90) },
    { id: 'g4', rect: rect(0, 560, 260, 90) },
    { id: 'z', rect: rect(0, 670, 800, 40) },
  ],
  slots: [
    { ownerId: 's', slot: 'children', rect: rect(0, 330, 800, 120), axis: 'y', empty: false },
    { ownerId: 'g', slot: 'children', rect: rect(0, 460, 800, 200), axis: 'x', empty: false },
  ],
  rootAxis: 'y',
  viewport: { width: 800, height: 600 },
  scroll: { x: 0, y: 0 },
  documentHeight: 710,
}

const offsetsOf = (preview: ReturnType<typeof canvasPreview>) => Object.fromEntries(preview.offsets)

describe('canvasPreview', () => {
  it('moves nothing without a target or for a drop that changes nothing', () => {
    const none = canvasPreview(layout, measurement, { kind: 'block', id: 'a' }, null)
    assert.equal(none.offsets.size, 0)
    assert.deepEqual(none.placeholder, rect(0, 0, 800, 100))
    const noop = canvasPreview(layout, measurement, { kind: 'block', id: 'a' }, target(null, 'children', 0, true))
    assert.equal(noop.offsets.size, 0)
  })

  it('moving down a list: the blocks in between move up by the dragged block and its gap', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'a' }, target(null, 'children', 2))
    assert.deepEqual(offsetsOf(preview), { b: { x: 0, y: -110 }, c: { x: 0, y: -110 } })
    assert.deepEqual(preview.placeholder, rect(0, 220, 800, 100))
  })

  it('moving up a list: the blocks in between move down', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'c' }, target(null, 'children', 0))
    assert.deepEqual(offsetsOf(preview), { a: { x: 0, y: 110 }, b: { x: 0, y: 110 } })
    assert.deepEqual(preview.placeholder, rect(0, 0, 800, 100))
  })

  it('into another list: the source list closes, the target opens and pushes what follows', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'b' }, target('s', 'children', 1))
    const o = offsetsOf(preview)
    // Root closes the gap of b (pitch 110), then the stack grows by the gap (min(100, max(50, 48)) + 10 = 60).
    assert.deepEqual(o.c, { x: 0, y: -110 })
    assert.deepEqual(o.s, { x: 0, y: -110 })
    assert.deepEqual(o.y, { x: 0, y: 60 })
    assert.deepEqual(o.g, { x: 0, y: -110 + 60 })
    assert.deepEqual(o.z, { x: 0, y: -110 + 60 })
    assert.equal(o.x, undefined)
    // The gap sits where y was, moved with the stack.
    assert.deepEqual(preview.placeholder, rect(0, 390 - 110, 800, 50))
  })

  it('in a grid: blocks move into the next cell and wrap', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'z' }, target('g', 'children', 1))
    const o = offsetsOf(preview)
    assert.deepEqual(o.g2, { x: 270, y: 0 })
    assert.deepEqual(o.g3, { x: -540, y: 100 })
    assert.deepEqual(o.g4, { x: 270, y: 0 })
    assert.deepEqual(preview.placeholder, rect(270, 460, 260, 90))
  })

  it('reordering a grid swaps cells', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'g1' }, target('g', 'children', 2))
    const o = offsetsOf(preview)
    assert.deepEqual(o.g2, { x: -270, y: 0 })
    assert.deepEqual(o.g3, { x: -270, y: 0 })
    assert.equal(o.g4, undefined)
    assert.deepEqual(preview.placeholder, rect(540, 460, 260, 90))
  })

  it('a new block opens a gap of a nominal size', () => {
    const preview = canvasPreview(layout, measurement, { kind: 'new', blockType: 'text' }, target(null, 'children', 1))
    const o = offsetsOf(preview)
    assert.deepEqual(o.b, { x: 0, y: 96 + 10 })
    assert.deepEqual(o.a, undefined)
    assert.equal(preview.placeholder?.y, 110)
    assert.equal(preview.placeholder?.height, 96)
  })

  it('works with the targets canvasDropTarget returns', () => {
    const blocks: BlockDefinition[] = [
      { type: 'text', label: 'Text', fields: [] },
      { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
      { type: 'grid', label: 'Grid', fields: [], slots: { children: {} } },
    ]
    const found = canvasDropTarget(layout, blocks, measurement, { x: 400, y: 200 }, { kind: 'block', id: 'a' })
    assert.ok(found)
    const preview = canvasPreview(layout, measurement, { kind: 'block', id: 'a' }, found)
    assert.deepEqual(offsetsOf(preview), { b: { x: 0, y: -110 } })
  })
})

describe('scrolledMeasurement', () => {
  it('moves every rect by the scroll since the start', () => {
    const moved = scrolledMeasurement(measurement, { x: 0, y: 50 })
    assert.equal(moved.blocks[0].rect.y, -50)
    assert.equal(moved.slots[0].rect.y, 280)
    assert.equal(scrolledMeasurement(measurement, { x: 0, y: 0 }), measurement)
  })
})

describe('outline preview', () => {
  const rows: FlatRow[] = rowOrder(layout, new Set()).map((r, i) => ({ ...r, top: i * 28, height: 28 }))

  it('lists rows depth first and skips collapsed children', () => {
    assert.deepEqual(
      rowOrder(layout, new Set(['g'])).map((r) => r.id),
      ['a', 'b', 'c', 's', 'x', 'y', 'g', 'z'],
    )
  })

  it('lifting a container hides its children and closes the rows below', () => {
    assert.deepEqual(childRows(rows, 's'), ['x', 'y'])
    const lifted = liftRows(rows, 's')
    assert.deepEqual(lifted.map((r) => r.id), ['a', 'b', 'c', 's', 'g', 'g1', 'g2', 'g3', 'g4', 'z'])
    assert.equal(lifted.find((r) => r.id === 'g')?.top, 4 * 28)
  })

  it('moves the rows to the preview order', () => {
    const order = previewRowOrder(layout, new Set(), { kind: 'block', id: 'a' }, target('s', 'children', 1))
    assert.deepEqual(order?.map((r) => r.id).slice(0, 6), ['b', 'c', 's', 'x', 'a', 'y'])
    const preview = outlinePreview(rows, order, 'a', 16)
    assert.deepEqual(preview.offsets.get('a'), { x: 16, y: 4 * 28 })
    assert.deepEqual(preview.offsets.get('b'), { x: 0, y: -28 })
    assert.equal(preview.offsets.get('y'), undefined)
    assert.deepEqual(preview.gap, { top: 4 * 28, depth: 1, height: 28 })
  })

  it('keeps a dragged container closed and its children under it', () => {
    const order = previewRowOrder(layout, new Set(), { kind: 'block', id: 's' }, target(null, 'children', 0))
    const preview = outlinePreview(rows, order, 's', 16)
    assert.deepEqual(preview.hidden, ['x', 'y'])
    assert.deepEqual(preview.offsets.get('s'), { x: 0, y: -3 * 28 })
    assert.deepEqual(preview.offsets.get('x'), { x: 0, y: -4 * 28 })
    // The grid rows move up by the two hidden rows.
    assert.deepEqual(preview.offsets.get('g'), { x: 0, y: -2 * 28 })
  })

  it('opens a gap row for a new block', () => {
    const order = previewRowOrder(layout, new Set(), { kind: 'new', blockType: 'text' }, target(null, 'children', 1))
    const preview = outlinePreview(rows, order, null, 16)
    assert.deepEqual(preview.gap, { top: 28, depth: 0, height: 28 })
    assert.deepEqual(preview.offsets.get('b'), { x: 0, y: 28 })
    assert.equal(order?.[1].id, DROP_ROW)
  })

  it('a drop that changes nothing keeps the lifted order', () => {
    assert.equal(previewRowOrder(layout, new Set(), { kind: 'block', id: 'a' }, null), null)
    const preview = outlinePreview(rows, null, 'a', 16)
    assert.equal(preview.offsets.size, 0)
  })
})

describe('motion', () => {
  it('springs start at 0 and settle at 1', () => {
    assert.equal(springAt({ response: 0.3, damping: 1 }, 0), 0)
    assert.ok(springAt({ response: 0.3, damping: 1 }, 0.4) > 0.99)
    // A bouncy spring overshoots.
    const peak = Math.max(...Array.from({ length: 40 }, (_, i) => springAt({ response: 0.3, damping: 0.5 }, i / 100)))
    assert.ok(peak > 1)
  })

  it('writes a CSS linear() easing that ends at 1', () => {
    const easing = springEasing({ response: 0.3, damping: 1, duration: 300 }, 4)
    assert.match(easing, /^linear\(0, [\d.]+, [\d.]+, [\d.]+, 1\)$/)
  })

  it('FLIP inverts the move and the width', () => {
    const flip = flipFrom(rect(100, 50, 200, 100), rect(0, 0, 400, 200), true)
    assert.deepEqual(flip, { x: 100, y: 50, scale: 0.5 })
    assert.ok(isStill(flipFrom(rect(0, 0, 10, 10), rect(0.2, 0, 10, 10))))
  })
})

describe('lifted copy', () => {
  const max = { width: 420, height: 300 }

  it('lifts small blocks at full size', () => {
    assert.equal(copyScale({ width: 300, height: 48 }, 1, max), 1)
  })

  it('shrinks a medium block to fit', () => {
    assert.equal(copyScale({ width: 600, height: 48 }, 1, max), 0.7)
  })

  it('uses the compact card for a block that would shrink too much', () => {
    assert.equal(copyScale({ width: 1200, height: 700 }, 1, max), null)
    // The same block on a zoomed-out canvas is small enough on screen.
    assert.equal(copyScale({ width: 1200, height: 700 }, 0.35, max), 1)
  })

  it('never lifts an empty block', () => {
    assert.equal(copyScale({ width: 0, height: 40 }, 1, max), null)
  })
})
