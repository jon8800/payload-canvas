import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { CanvasMeasurement, Layout } from '../../../core/types'
import { changedIds, cursorAt, cursorPoint, initials, sameAwareness, shortName } from './presence'

const layout: Layout = {
  version: 1,
  blocks: [{ id: 's', type: 'stack', slots: { children: [{ id: 'h', type: 'heading' }] } }],
}

const measure = (width: number, scrollY = 0, sRect = { x: 0, y: 0, width, height: 400 }): CanvasMeasurement => ({
  blocks: [
    { id: 's', rect: sRect },
    { id: 'h', rect: { x: sRect.x + 20, y: sRect.y + 20, width: sRect.width - 40, height: 100 } },
  ],
  slots: [],
  rootAxis: 'y',
  viewport: { width, height: 800 },
  scroll: { x: 0, y: scrollY },
  documentHeight: 2000,
})

describe('cursor mapping', () => {
  it('maps the pointer to the deepest block, as shares of its rect', () => {
    const cursor = cursorAt(layout, measure(1000), { x: 500, y: 70 })
    assert.equal(cursor.blockId, 'h')
    assert.ok(Math.abs(cursor.x - 0.5) < 1e-9)
    assert.ok(Math.abs(cursor.y - 0.5) < 1e-9)
  })

  it('lands on the same spot of the block on a narrower, scrolled canvas', () => {
    const cursor = cursorAt(layout, measure(1000), { x: 500, y: 70 })
    const other = measure(400, 0, { x: 0, y: -300, width: 400, height: 600 })
    const point = cursorPoint(other, cursor)
    assert.deepEqual(point, { x: 20 + 0.5 * 360, y: -280 + 50 })
  })

  it('over no block: shares of the viewport width and the document height', () => {
    const cursor = cursorAt(layout, measure(1000, 200), { x: 250, y: 600 })
    assert.deepEqual(cursor, { blockId: null, x: 0.25, y: 0.4 })
    assert.deepEqual(cursorPoint(measure(500, 0), cursor), { x: 125, y: 800 })
  })

  it('hides a cursor on a block this canvas does not show', () => {
    assert.equal(cursorPoint(measure(1000), { blockId: 'gone', x: 0.5, y: 0.5 }), null)
  })
})

describe('presence helpers', () => {
  it('initials and short names', () => {
    assert.equal(initials('Ana Lima'), 'AL')
    assert.equal(initials('builder-dev2@local.test'), 'BD')
    assert.equal(initials(''), '?')
    assert.equal(shortName('builder-dev@local.test'), 'builder-dev')
    assert.equal(shortName('Claude'), 'Claude')
  })

  it('changedIds lists inserted, moved and updated blocks, not removed ones', () => {
    assert.deepEqual(
      changedIds([
        { type: 'insert', block: { id: 'n', type: 'heading' }, to: { parentId: null, index: 0 } },
        { type: 'update', id: 'u', props: {} },
        { type: 'remove', id: 'r' },
      ]),
      ['n', 'u'],
    )
  })

  it('sameAwareness ignores sub-pixel cursor jitter', () => {
    const a = { selectedId: 'x', hoveredId: null, canvasWidth: 800, cursor: { blockId: 'h', x: 0.5, y: 0.5 } }
    assert.equal(sameAwareness(a, { ...a, cursor: { blockId: 'h', x: 0.5004, y: 0.5 } }), true)
    assert.equal(sameAwareness(a, { ...a, cursor: { blockId: 'h', x: 0.52, y: 0.5 } }), false)
    assert.equal(sameAwareness(a, { ...a, selectedId: 'y' }), false)
  })
})
