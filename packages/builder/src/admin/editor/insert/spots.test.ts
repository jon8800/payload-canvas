import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, CanvasMeasurement, Layout } from '../../../core/types'
import { insertSpotAt, sameSpot, spotPosition } from './spots'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'row', label: 'Row', fields: [], slots: { children: {} } },
  { type: 'only', label: 'Locked', fields: [], slots: { children: { allow: ['nothing'] } } },
  { type: 'heading', label: 'Heading', fields: [] },
  { type: 'text', label: 'Text', fields: [] },
]

// Root (vertical): heading h, stack s (a, b with a 30 px gap), empty stack e, row r (x, y side by side), locked l (t).
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'h', type: 'heading' },
    { id: 's', type: 'stack', slots: { children: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }] } },
    { id: 'e', type: 'stack' },
    { id: 'r', type: 'row', slots: { children: [{ id: 'x', type: 'text' }, { id: 'y', type: 'text' }] } },
    { id: 'l', type: 'only', slots: { children: [{ id: 't', type: 'text' }] } },
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
    { id: 'x', rect: { x: 20, y: 370, width: 160, height: 60 } },
    { id: 'y', rect: { x: 220, y: 370, width: 160, height: 60 } },
    { id: 'l', rect: { x: 0, y: 450, width: 400, height: 100 } },
    { id: 't', rect: { x: 20, y: 470, width: 360, height: 60 } },
  ],
  slots: [
    { ownerId: 's', slot: 'children', rect: { x: 0, y: 50, width: 400, height: 200 }, axis: 'y', empty: false },
    { ownerId: 'e', slot: 'children', rect: { x: 10, y: 260, width: 380, height: 80 }, axis: 'y', empty: true },
    { ownerId: 'r', slot: 'children', rect: { x: 0, y: 350, width: 400, height: 100 }, axis: 'x', empty: false },
    { ownerId: 'l', slot: 'children', rect: { x: 0, y: 450, width: 400, height: 100 }, axis: 'y', empty: false },
  ],
  rootAxis: 'y',
  viewport: { width: 400, height: 800 },
  scroll: { x: 0, y: 0 },
  documentHeight: 550,
}

describe('insertSpotAt', () => {
  it('puts the spot before or after a leaf, by the pointer side', () => {
    const before = insertSpotAt(layout, blocks, m, { x: 100, y: 80 })
    assert.deepEqual(before && spotPosition(before), { parentId: 's', slot: 'children', index: 0 })
    assert.equal(before?.kind, 'between')
    assert.equal(before?.at.y, 70)
    const after = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    assert.deepEqual(after && spotPosition(after), { parentId: 's', slot: 'children', index: 1 })
  })

  it('centers the button in the gap between two blocks', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    // a ends at 130, b starts at 160.
    assert.equal(spot?.at.y, 145)
    assert.equal(spot?.at.x, 200)
    assert.equal(spot?.rect.width, 360)
  })

  it('uses the gap between children when the pointer is in it', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 150 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: 's', slot: 'children', index: 1 })
    assert.equal(spot?.at.y, 145)
    const last = insertSpotAt(layout, blocks, m, { x: 100, y: 235 })
    assert.deepEqual(last && spotPosition(last), { parentId: 's', slot: 'children', index: 2 })
  })

  it('puts the spot around a container near its edge', () => {
    const top = insertSpotAt(layout, blocks, m, { x: 100, y: 53 })
    assert.deepEqual(top && spotPosition(top), { parentId: null, slot: 'children', index: 1 })
    assert.equal(top?.at.y, 50)
    const bottom = insertSpotAt(layout, blocks, m, { x: 100, y: 247 })
    assert.deepEqual(bottom && spotPosition(bottom), { parentId: null, slot: 'children', index: 2 })
  })

  it('goes inside an empty slot', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 200, y: 300 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: 'e', slot: 'children', index: 0 })
    assert.equal(spot?.kind, 'empty')
    assert.deepEqual(spot?.at, { x: 200, y: 300 })
  })

  it('follows a horizontal list: left or right of a block', () => {
    const left = insertSpotAt(layout, blocks, m, { x: 40, y: 400 })
    assert.deepEqual(left && spotPosition(left), { parentId: 'r', slot: 'children', index: 0 })
    assert.equal(left?.axis, 'x')
    assert.equal(left?.at.x, 20)
    const right = insertSpotAt(layout, blocks, m, { x: 170, y: 400 })
    assert.deepEqual(right && spotPosition(right), { parentId: 'r', slot: 'children', index: 1 })
    // x ends at 180, y starts at 220.
    assert.equal(right?.at.x, 200)
  })

  it('moves up to the parent when the slot accepts no block type', () => {
    const spot = insertSpotAt(layout, blocks, m, { x: 100, y: 480 })
    assert.deepEqual(spot && spotPosition(spot), { parentId: null, slot: 'children', index: 4 })
  })

  it('offers the root list below the last block and on an empty page', () => {
    const below = insertSpotAt(layout, blocks, m, { x: 100, y: 700 })
    assert.deepEqual(below && spotPosition(below), { parentId: null, slot: 'children', index: 5 })
    const empty = insertSpotAt({ version: 1, blocks: [] }, blocks, m, { x: 10, y: 10 })
    assert.equal(empty?.kind, 'empty')
    assert.deepEqual(empty && spotPosition(empty), { parentId: null, slot: 'children', index: 0 })
  })

  it('compares spots by position and place', () => {
    const a = insertSpotAt(layout, blocks, m, { x: 100, y: 125 })
    const b = insertSpotAt(layout, blocks, m, { x: 120, y: 128 })
    assert.equal(sameSpot(a, b), true)
    assert.equal(sameSpot(a, insertSpotAt(layout, blocks, m, { x: 100, y: 80 })), false)
    assert.equal(sameSpot(null, null), true)
    assert.equal(sameSpot(a, null), false)
  })
})
