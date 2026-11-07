import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasDropTarget, deepestBlockAt } from './dropTarget'
import { layerAt, reachableAt } from './layers'
import type { BlockDefinition, CanvasMeasurement, Layout } from './types'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'popup', label: 'Popup', fields: [], slots: { trigger: {}, content: {} } },
  { type: 'text', label: 'Text', fields: [] },
]

// A page section with a deep text (s > i > deep), and a popup whose open box (over the page) holds
// one text. The page's text is deeper in the layout than the popup's.
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 's', type: 'stack', slots: { children: [{ id: 'i', type: 'stack', slots: { children: [{ id: 'deep', type: 'text' }] } }] } },
    { id: 'p', type: 'popup', slots: { trigger: [{ id: 'tr', type: 'text' }], content: [{ id: 'c', type: 'text' }] } },
  ],
}

const box = { x: 100, y: 100, width: 200, height: 200 }

const m: CanvasMeasurement = {
  blocks: [
    { id: 's', rect: { x: 0, y: 0, width: 400, height: 400 } },
    { id: 'i', rect: { x: 0, y: 0, width: 400, height: 400 } },
    { id: 'deep', rect: { x: 0, y: 0, width: 400, height: 400 } },
    { id: 'p', rect: { x: 0, y: 400, width: 100, height: 40 } },
    { id: 'tr', rect: { x: 0, y: 400, width: 100, height: 40 } },
    { id: 'c', rect: { x: 120, y: 120, width: 160, height: 60 }, layer: 0 },
  ],
  slots: [
    { ownerId: 's', slot: 'children', rect: { x: 0, y: 0, width: 400, height: 400 }, axis: 'y', empty: false },
    { ownerId: 'p', slot: 'content', rect: { x: 120, y: 120, width: 160, height: 160 }, axis: 'y', empty: false, layer: 0 },
  ],
  layers: [{ ownerId: 'p', rect: box }],
  rootAxis: 'y',
  viewport: { width: 400, height: 800 },
  scroll: { x: 0, y: 0 },
  documentHeight: 440,
}

describe('layers', () => {
  it('finds the top layer under a point', () => {
    assert.equal(layerAt(m, { x: 150, y: 150 }), 0)
    assert.equal(layerAt(m, { x: 10, y: 10 }), -1)
    const nested = { ...m, layers: [{ ownerId: 'p', rect: box }, { ownerId: 'q', rect: { x: 140, y: 140, width: 20, height: 20 } }] }
    assert.equal(layerAt(nested, { x: 150, y: 150 }), 1)
  })

  it('over the box reaches only its blocks and its owner; elsewhere only the page', () => {
    const inBox = reachableAt(m, { x: 150, y: 150 })
    assert.deepEqual(inBox.blocks.map((b) => b.id), ['p', 'c'])
    assert.deepEqual(inBox.blocks[0]!.rect, box)
    assert.deepEqual(inBox.slots.map((s) => s.ownerId), ['p'])
    const onPage = reachableAt(m, { x: 10, y: 10 })
    assert.deepEqual(onPage.blocks.map((b) => b.id), ['s', 'i', 'deep', 'p', 'tr'])
    // Without layers nothing changes.
    const plain = { ...m, layers: undefined }
    assert.equal(reachableAt(plain, { x: 150, y: 150 }), plain)
  })

  it('hit tests the popup over a deeper page block', () => {
    assert.equal(deepestBlockAt(layout, m, { x: 150, y: 150 }), 'c')
    // The box's padding selects the popup, never the page block under it.
    assert.equal(deepestBlockAt(layout, m, { x: 150, y: 250 }), 'p')
    assert.equal(deepestBlockAt(layout, m, { x: 10, y: 10 }), 'deep')
  })

  it('drops into the popup, not the page under it', () => {
    const target = canvasDropTarget(layout, blocks, m, { x: 150, y: 170 }, { kind: 'new', blockType: 'text' })
    assert.equal(target?.to.parentId, 'p')
    assert.equal(target?.to.slot, 'content')
  })
})
