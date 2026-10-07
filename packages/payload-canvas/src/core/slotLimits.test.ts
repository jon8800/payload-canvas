import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describeBlock } from '../mcp/shared'
import { slotFullError, slotRoom } from './blocks'
import { canvasDropTarget, outlineDropTarget } from './dropTarget'
import { describeLayoutErrors } from './issues'
import { applyOperation, applyOperations } from './operations'
import { blockJsonSchema } from './schema'
import type { BlockDefinition, CanvasMeasurement, Layout, OutlineRow } from './types'
import { isBlockingError, validateLayout } from './validate'

// A CTA with one heading at most, and a list that needs two items.
const blocks: BlockDefinition[] = [
  { type: 'cta', label: 'CTA contact', fields: [], slots: { headingBlock: { label: 'Heading', allow: ['heading'], max: 1 }, rest: {} } },
  { type: 'list', label: 'List', fields: [], slots: { items: { allow: ['heading'], min: 2 } } },
  { type: 'heading', label: 'Heading', fields: [] },
]

const full: Layout = {
  version: 1,
  blocks: [
    { id: 'c', type: 'cta', slots: { headingBlock: [{ id: 'h1', type: 'heading' }], rest: [{ id: 'h2', type: 'heading' }] } },
    { id: 'c2', type: 'cta' },
  ],
}

const opts = { blocks }
const FULL = '"Heading" in CTA contact takes at most 1 block'

describe('slot max: operations', () => {
  it('refuses an insert into a full slot', () => {
    const result = applyOperation(full, { type: 'insert', block: { id: 'n', type: 'heading' }, to: { parentId: 'c', slot: 'headingBlock', index: 1 } }, opts)
    assert.equal(!result.ok && result.error, FULL)
  })

  it('accepts an insert into a slot with room', () => {
    const result = applyOperation(full, { type: 'insert', block: { id: 'n', type: 'heading' }, to: { parentId: 'c2', slot: 'headingBlock', index: 0 } }, opts)
    assert.equal(result.ok, true)
  })

  it('refuses a second insert in one batch once the slot is full', () => {
    const result = applyOperations(
      full,
      [
        { type: 'insert', block: { id: 'n1', type: 'heading' }, to: { parentId: 'c2', slot: 'headingBlock', index: 0 } },
        { type: 'insert', block: { id: 'n2', type: 'heading' }, to: { parentId: 'c2', slot: 'headingBlock', index: 1 } },
      ],
      opts,
    )
    assert.equal(!result.ok && result.error, `Operation 1 (insert): ${FULL}`)
  })

  it('refuses a move from another slot into a full slot, allows a move within it or out of it', () => {
    assert.equal(applyOperation(full, { type: 'move', id: 'h2', to: { parentId: 'c', slot: 'headingBlock', index: 0 } }, opts).ok, false)
    assert.equal(applyOperation(full, { type: 'move', id: 'h1', to: { parentId: 'c', slot: 'headingBlock', index: 0 } }, opts).ok, true)
    assert.equal(applyOperation(full, { type: 'move', id: 'h1', to: { parentId: 'c2', slot: 'headingBlock', index: 0 } }, opts).ok, true)
  })

  it('refuses a duplicate inside a full slot, allows it elsewhere', () => {
    const refused = applyOperation(full, { type: 'duplicate', id: 'h1', newId: 'copy' }, opts)
    assert.equal(!refused.ok && refused.error, FULL)
    assert.equal(applyOperation(full, { type: 'duplicate', id: 'h2', newId: 'copy' }, opts).ok, true)
  })

  it('checks only the tree shape without block definitions', () => {
    assert.equal(applyOperation(full, { type: 'duplicate', id: 'h1', newId: 'copy' }).ok, true)
  })

  it('reports the room left in a slot', () => {
    assert.equal(slotRoom(blocks, full, 'c', 'headingBlock'), 0)
    assert.equal(slotRoom(blocks, full, 'c2', 'headingBlock'), 1)
    assert.equal(slotRoom(blocks, full, 'c', 'rest'), Infinity)
    assert.equal(slotRoom(blocks, full, null, 'children'), Infinity)
    assert.equal(slotFullError(blocks, full.blocks[1], 'headingBlock'), null)
  })
})

describe('slot max: drop targets', () => {
  const rows: OutlineRow[] = [
    { id: 'c', depth: 0, rect: { x: 0, y: 0, width: 300, height: 20 } },
    { id: 'h1', depth: 1, rect: { x: 0, y: 20, width: 300, height: 20 } },
    { id: 'h2', depth: 1, rect: { x: 0, y: 40, width: 300, height: 20 } },
    { id: 'c2', depth: 0, rect: { x: 0, y: 60, width: 300, height: 20 } },
  ]

  it('never drops a new block next to a block in the full slot (outline)', () => {
    assert.equal(outlineDropTarget(full, blocks, rows, { x: 50, y: 22 }, { kind: 'new', blockType: 'heading' }, 16), null)
  })

  it('still reorders a block that already sits in the full slot (outline)', () => {
    // The middle of the CTA row: inside its first slot that accepts the block.
    const own = outlineDropTarget(full, blocks, rows, { x: 50, y: 10 }, { kind: 'block', id: 'h1' }, 16)
    assert.equal(own?.to.slot, 'headingBlock')
    // Another heading skips the full slot and goes into "rest".
    const other = outlineDropTarget(full, blocks, rows, { x: 50, y: 10 }, { kind: 'block', id: 'h2' }, 16)
    assert.equal(other?.to.slot, 'rest')
  })

  it('drops into the next slot with room (canvas)', () => {
    const m: CanvasMeasurement = {
      blocks: [
        { id: 'c', rect: { x: 0, y: 0, width: 400, height: 200 } },
        { id: 'h1', rect: { x: 20, y: 20, width: 360, height: 60 } },
        { id: 'h2', rect: { x: 20, y: 120, width: 360, height: 60 } },
        { id: 'c2', rect: { x: 0, y: 200, width: 400, height: 100 } },
      ],
      slots: [
        { ownerId: 'c', slot: 'headingBlock', rect: { x: 0, y: 0, width: 400, height: 100 }, axis: 'y', empty: false },
        { ownerId: 'c', slot: 'rest', rect: { x: 0, y: 100, width: 400, height: 100 }, axis: 'y', empty: false },
      ],
      rootAxis: 'y',
      viewport: { width: 400, height: 800 },
      scroll: { x: 0, y: 0 },
      documentHeight: 300,
    }
    // The pointer is in the full slot's area, inside the CTA, not on a child.
    const target = canvasDropTarget(full, blocks, m, { x: 200, y: 90 }, { kind: 'new', blockType: 'heading' })
    assert.equal(target?.to.parentId, 'c')
    assert.equal(target?.to.slot, 'rest')
  })
})

describe('slot min and max: validation', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 'l', type: 'list', slots: { items: [{ id: 'i1', type: 'heading' }] } },
      { id: 'l2', type: 'list' },
      {
        id: 'c',
        type: 'cta',
        slots: {
          headingBlock: [
            { id: 'h1', type: 'heading' },
            { id: 'h2', type: 'heading' },
          ],
        },
      },
    ],
  }

  it('reports too few and too many blocks as publish-only problems', () => {
    const errors = validateLayout(layout, blocks)
    assert.deepEqual(
      errors.map((e) => [e.blockId, e.path, e.message, e.code]),
      [
        ['l', 'blocks[0].slots.items', '"items" takes at least 2 blocks', 'constraint'],
        ['l2', 'blocks[1].slots.items', '"items" takes at least 2 blocks', 'constraint'],
        ['c', 'blocks[2].slots.headingBlock', '"Heading" takes at most 1 block', 'constraint'],
      ],
    )
    assert.ok(errors.every((e) => !isBlockingError(e, false) && isBlockingError(e, true)))
    assert.deepEqual(
      describeLayoutErrors(layout, errors, blocks).map((e) => e.message),
      ['List: "items" takes at least 2 blocks', 'List: "items" takes at least 2 blocks', 'CTA contact: "Heading" takes at most 1 block'],
    )
  })

  it('puts the limits in the JSON Schema for AI tools', () => {
    type Slots = { slots: { properties: Record<string, Record<string, unknown>> } }
    const cta = (blockJsonSchema(blocks[0], blocks).properties as Slots).slots.properties
    assert.equal(cta.headingBlock.maxItems, 1)
    assert.match(String(cta.headingBlock.description), /Holds at most 1 block\./)
    const list = (blockJsonSchema(blocks[1], blocks).properties as Slots).slots.properties
    assert.equal(list.items.minItems, 2)
  })

  it('shows the limits in the block catalog for AI models (MCP listBlocks, assistant)', () => {
    assert.deepEqual(describeBlock(blocks[0]).slots, {
      headingBlock: { label: 'Heading', accepts: ['heading'], maxBlocks: 1 },
      rest: { accepts: 'any block' },
    })
    assert.deepEqual(describeBlock(blocks[1]).slots, { items: { accepts: ['heading'], minBlocks: 2 } })
  })
})
