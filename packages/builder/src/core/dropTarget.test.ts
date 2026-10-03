import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasDropTarget, deepestBlockAt, outlineDropTarget } from './dropTarget'
import type { BlockDefinition, CanvasMeasurement, DragSource, Layout, OutlineRow } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'row', label: 'Text row', fields: [], slots: { children: { allow: ['text'] } } },
  { type: 'heading', label: 'Heading', fields: [] },
  { type: 'text', label: 'Text', fields: [] },
]

// Vertical root: heading, a stack with two leaves, an empty stack, and a row that accepts only text.
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading', props: { text: 'H' } },
    {
      id: 's',
      type: 'stack',
      slots: {
        children: [
          { id: 'a', type: 'text' },
          { id: 'b', type: 'text' },
        ],
      },
    },
    { id: 'e', type: 'stack' },
    { id: 'r', type: 'row', slots: { children: [{ id: 't', type: 'text' }] } },
  ],
}

const m: CanvasMeasurement = {
  blocks: [
    { id: 'h', rect: { x: 0, y: 0, width: 400, height: 50 } },
    { id: 's', rect: { x: 0, y: 50, width: 400, height: 200 } },
    { id: 'a', rect: { x: 20, y: 70, width: 360, height: 60 } },
    { id: 'b', rect: { x: 20, y: 160, width: 360, height: 60 } },
    { id: 'e', rect: { x: 0, y: 250, width: 400, height: 100 } },
    { id: 'r', rect: { x: 0, y: 350, width: 400, height: 100 } },
    { id: 't', rect: { x: 20, y: 370, width: 360, height: 60 } },
  ],
  slots: [
    { ownerId: 's', slot: 'children', rect: { x: 0, y: 50, width: 400, height: 200 }, axis: 'y', empty: false },
    { ownerId: 'e', slot: 'children', rect: { x: 0, y: 250, width: 400, height: 100 }, axis: 'y', empty: true },
    { ownerId: 'r', slot: 'children', rect: { x: 0, y: 350, width: 400, height: 100 }, axis: 'y', empty: false },
  ],
  rootAxis: 'y',
  viewport: { width: 400, height: 800 },
  scroll: { x: 0, y: 0 },
  documentHeight: 450,
}

const dragH: DragSource = { kind: 'block', id: 'h' }
const newText: DragSource = { kind: 'new', blockType: 'text' }
const newHeading: DragSource = { kind: 'new', blockType: 'heading' }

describe('deepestBlockAt', () => {
  it('returns the deepest block id under the point', () => {
    assert.equal(deepestBlockAt(layout, m, { x: 100, y: 100 }), 'a')
    assert.equal(deepestBlockAt(layout, m, { x: 5, y: 100 }), 's')
    assert.equal(deepestBlockAt(layout, m, { x: 100, y: 100 }, new Set(['a'])), 's')
    assert.equal(deepestBlockAt(layout, m, { x: 100, y: 900 }), null)
  })
})

describe('canvasDropTarget', () => {
  it('drops after the lower half of a nested leaf', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 100, y: 120 }, dragH)
    assert.deepEqual(t?.to, { parentId: 's', slot: 'children', index: 1 })
    assert.equal(t?.indicator.kind, 'line')
    assert.equal(t?.noop, false)
  })

  it('drops into an empty slot with a box indicator', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 200, y: 300 }, dragH)
    assert.deepEqual(t?.to, { parentId: 'e', slot: 'children', index: 0 })
    assert.equal(t?.indicator.kind, 'box')
  })

  it('drops before a container when the pointer is on its top edge', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 200, y: 253 }, dragH)
    assert.deepEqual(t?.to, { parentId: null, slot: 'children', index: 1 })
  })

  it('never targets the dragged block or its descendants', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 100, y: 100 }, { kind: 'block', id: 's' })
    assert.notEqual(t?.to.parentId, 's')
    assert.equal(t?.noop, true)
  })

  it('drops into the root list when no block is under the pointer', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 100, y: 600 }, newText)
    assert.deepEqual(t?.to, { parentId: null, slot: 'children', index: 4 })
  })

  it('fills an empty canvas with a box', () => {
    const t = canvasDropTarget({ version: 1, blocks: [] }, blocks, m, { x: 10, y: 10 }, newText)
    assert.deepEqual(t?.to, { parentId: null, slot: 'children', index: 0 })
    assert.equal(t?.indicator.kind, 'box')
  })

  it('a slot that allows the type is a target', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 100, y: 420 }, newText)
    assert.deepEqual(t?.to, { parentId: 'r', slot: 'children', index: 1 })
  })

  it('a leaf in a slot that rejects the type falls through to its container', () => {
    const before = canvasDropTarget(layout, blocks, m, { x: 100, y: 380 }, dragH)
    assert.deepEqual(before?.to, { parentId: null, slot: 'children', index: 2 })
    const after = canvasDropTarget(layout, blocks, m, { x: 100, y: 420 }, newHeading)
    assert.deepEqual(after?.to, { parentId: null, slot: 'children', index: 4 })
  })

  it('a container with no accepting slot is treated like a leaf', () => {
    const t = canvasDropTarget(layout, blocks, m, { x: 5, y: 410 }, newHeading)
    assert.deepEqual(t?.to, { parentId: null, slot: 'children', index: 4 })
    assert.equal(t?.indicator.kind, 'line')
  })

  it('returns null when the dragged block does not exist', () => {
    assert.equal(canvasDropTarget(layout, blocks, m, { x: 100, y: 100 }, { kind: 'block', id: 'gone' }), null)
  })
})

describe('outlineDropTarget', () => {
  const rows: OutlineRow[] = [
    { id: 'h', rect: { x: 0, y: 0, width: 200, height: 20 }, depth: 0 },
    { id: 's', rect: { x: 0, y: 20, width: 200, height: 20 }, depth: 0 },
    { id: 'a', rect: { x: 0, y: 40, width: 200, height: 20 }, depth: 1 },
    { id: 'b', rect: { x: 0, y: 60, width: 200, height: 20 }, depth: 1 },
    { id: 'e', rect: { x: 0, y: 80, width: 200, height: 20 }, depth: 0 },
    { id: 'r', rect: { x: 0, y: 100, width: 200, height: 20 }, depth: 0 },
    { id: 't', rect: { x: 0, y: 120, width: 200, height: 20 }, depth: 1 },
  ]

  it('middle of a container row drops inside', () => {
    assert.deepEqual(outlineDropTarget(layout, blocks, rows, { x: 50, y: 30 }, dragH, 12)?.to, {
      parentId: 's',
      slot: 'children',
      index: 2,
    })
  })

  it('refuses the dragged block\'s own subtree', () => {
    assert.equal(outlineDropTarget(layout, blocks, rows, { x: 50, y: 50 }, { kind: 'block', id: 's' }, 12), null)
  })

  it('leaf rows: top half before, bottom half after', () => {
    assert.deepEqual(outlineDropTarget(layout, blocks, rows, { x: 50, y: 42 }, newText, 12)?.to, {
      parentId: 's',
      slot: 'children',
      index: 0,
    })
    assert.deepEqual(outlineDropTarget(layout, blocks, rows, { x: 50, y: 58 }, newText, 12)?.to, {
      parentId: 's',
      slot: 'children',
      index: 1,
    })
  })

  it('bottom of an open container row drops as its first child', () => {
    const t = outlineDropTarget(layout, blocks, rows, { x: 50, y: 38 }, newText, 12)
    assert.deepEqual(t?.to, { parentId: 's', slot: 'children', index: 0 })
    assert.equal(t?.indicator.rect.x, 12)
  })

  it('below the last row appends to the root', () => {
    assert.deepEqual(outlineDropTarget(layout, blocks, rows, { x: 50, y: 300 }, dragH, 12)?.to, {
      parentId: null,
      slot: 'children',
      index: 3,
    })
  })

  it('a container whose slot rejects the type is not a target', () => {
    const middle = outlineDropTarget(layout, blocks, rows, { x: 50, y: 108 }, newHeading, 12)
    assert.deepEqual(middle?.to, { parentId: null, slot: 'children', index: 3 })
    const bottom = outlineDropTarget(layout, blocks, rows, { x: 50, y: 118 }, newHeading, 12)
    assert.equal(bottom, null)
    const inside = outlineDropTarget(layout, blocks, rows, { x: 50, y: 110 }, newText, 12)
    assert.deepEqual(inside?.to, { parentId: 'r', slot: 'children', index: 1 })
  })

  it('a leaf inside a rejecting slot is not a target', () => {
    assert.equal(outlineDropTarget(layout, blocks, rows, { x: 50, y: 125 }, newHeading, 12), null)
  })
})
