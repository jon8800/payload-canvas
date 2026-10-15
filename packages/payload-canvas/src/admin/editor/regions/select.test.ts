import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { canvasDropTarget } from '../../../core'
import type { BlockDefinition, CanvasMeasurement, Layout } from '../../../core/types'
import { sameMeasurement } from '../../../react/canvas/measure'
import { insertSpotAt } from '../insert/spots'
import { isFieldElementId } from '../topbar/settingsFocus'
import { ownerKey, regionAt } from './select'

const blocks: BlockDefinition[] = [{ type: 'text', label: 'Text', fields: [] }]
const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'a', type: 'text' },
    { id: 'b', type: 'text' },
  ],
}

// A page frame: a header region (0–200), the layout outlet (200–400) with two blocks, a footer region (400–500).
const framed: CanvasMeasurement = {
  blocks: [
    { id: 'a', rect: { x: 0, y: 200, width: 800, height: 100 } },
    { id: 'b', rect: { x: 0, y: 300, width: 800, height: 100 } },
  ],
  slots: [],
  rootAxis: 'y',
  root: { x: 0, y: 200, width: 800, height: 200 },
  regions: [
    { name: 'header', rect: { x: 0, y: 0, width: 800, height: 200 } },
    { name: 'badge', rect: { x: 20, y: 20, width: 100, height: 40 } },
    { name: 'footer', rect: { x: 0, y: 400, width: 800, height: 100 } },
  ],
  viewport: { width: 800, height: 600 },
  scroll: { x: 0, y: 0 },
  documentHeight: 500,
}

describe('regions on the canvas', () => {
  it('finds the region under a point, the smallest one first, never inside the layout', () => {
    assert.equal(regionAt(framed, { x: 400, y: 100 }), 'header')
    assert.equal(regionAt(framed, { x: 30, y: 30 }), 'badge')
    assert.equal(regionAt(framed, { x: 400, y: 450 }), 'footer')
    assert.equal(regionAt(framed, { x: 400, y: 250 }), null)
    assert.equal(regionAt({ ...framed, regions: undefined }, { x: 400, y: 100 }), null)
  })

  it('keys owners so a block id and a region name never collide', () => {
    assert.notEqual(ownerKey({ id: 'header' }), ownerKey({ id: '', region: 'header' }))
  })

  it('drops over a fixed region into the layout next to it, never into the region', () => {
    const above = canvasDropTarget(layout, blocks, framed, { x: 400, y: 100 }, { kind: 'new', blockType: 'text' })
    assert.deepEqual(above?.to, { parentId: null, slot: 'children', index: 0 })
    const below = canvasDropTarget(layout, blocks, framed, { x: 400, y: 450 }, { kind: 'new', blockType: 'text' })
    assert.deepEqual(below?.to, { parentId: null, slot: 'children', index: 2 })
  })

  it('puts an empty layout’s drop box and "+" in the layout outlet, between the regions', () => {
    const empty: Layout = { version: 1, blocks: [] }
    const measurement = { ...framed, blocks: [], root: { x: 0, y: 200, width: 800, height: 40 } }
    const drop = canvasDropTarget(empty, blocks, measurement, { x: 400, y: 100 }, { kind: 'new', blockType: 'text' })
    assert.deepEqual(drop?.indicator, { kind: 'box', rect: { x: 0, y: 200, width: 800, height: 80 } })
    const spot = insertSpotAt(empty, blocks, measurement, { x: 400, y: 220 })
    assert.equal(spot?.kind, 'empty')
    assert.deepEqual(spot?.rect, { x: 0, y: 200, width: 800, height: 120 })
    assert.deepEqual(spot?.at, { x: 400, y: 260 })
    // Without a frame: the top of the canvas, as before.
    const plain = canvasDropTarget(empty, blocks, { ...measurement, root: undefined, regions: undefined }, { x: 10, y: 10 }, { kind: 'new', blockType: 'text' })
    assert.deepEqual(plain?.indicator, { kind: 'box', rect: { x: 0, y: 0, width: 800, height: 80 } })
  })

  it('sends a new measurement when a region or the outlet moves', () => {
    const moved = { ...framed, regions: framed.regions?.map((r) => (r.name === 'footer' ? { ...r, rect: { ...r.rect, y: 410 } } : r)) }
    assert.equal(sameMeasurement(framed, { ...framed }), true)
    assert.equal(sameMeasurement(framed, moved), false)
    assert.equal(sameMeasurement(framed, { ...framed, root: { x: 0, y: 210, width: 800, height: 200 } }), false)
    assert.equal(sameMeasurement(framed, { ...framed, root: undefined }), false)
  })

  it('knows Payload’s element id of a field, also with the drawer depth', () => {
    assert.equal(isFieldElementId('field-title', 'title'), true)
    assert.equal(isFieldElementId('field-title-2', 'title'), true)
    assert.equal(isFieldElementId('field-header__title-2', 'header.title'), true)
    assert.equal(isFieldElementId('field-titleExtra', 'title'), false)
    assert.equal(isFieldElementId('field-title-x', 'title'), false)
  })
})
