import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { CanvasMeasurement, Layout } from '../../core/types'
import { contentRects, placeToolbar } from './placement'

const size = { width: 100, height: 30 }
const viewport = { width: 800, height: 600 }
const target = { x: 50, y: 200, width: 300, height: 80 }
const rect = (y: number) => ({ x: 0, y, width: 10, height: 10 })

test('goes above when nothing is there, and on a tie', () => {
  assert.deepEqual(placeToolbar(target, size, viewport, [], 6), { place: 'above', left: 50, top: 164 })
})

test('goes below when the content above would be covered and below is free', () => {
  const heading = { x: 50, y: 150, width: 300, height: 40 }
  assert.deepEqual(placeToolbar(target, size, viewport, [heading], 6), { place: 'below', left: 50, top: 286 })
})

test('picks the side that covers less', () => {
  const above = { x: 50, y: 150, width: 300, height: 40 }
  const below = { x: 50, y: 290, width: 30, height: 10 }
  assert.equal(placeToolbar(target, size, viewport, [above, below], 6).place, 'below')
  const bigBelow = { x: 0, y: 280, width: 800, height: 100 }
  assert.equal(placeToolbar(target, size, viewport, [above, bigBelow], 6).place, 'above')
})

test('stays inside the viewport', () => {
  // No room above: below, even when something is there.
  const top = { x: 50, y: 10, width: 300, height: 80 }
  assert.equal(placeToolbar(top, size, viewport, [{ x: 0, y: 90, width: 800, height: 100 }], 6).place, 'below')
  // A block taller than the viewport: inside, at the top of the visible part.
  const tall = { x: 50, y: -100, width: 300, height: 900 }
  assert.deepEqual(placeToolbar(tall, size, viewport, [], 6), { place: 'inside', left: 50, top: 6 })
  // Near the right edge: moved left.
  assert.equal(placeToolbar({ ...target, x: 750 }, size, viewport, [], 6).left, 700)
})

test('content rects are the leaf blocks other than the edited block', () => {
  const layout: Layout = {
    version: 1,
    blocks: [
      { id: 's', type: 'stack', slots: { children: [{ id: 'h', type: 'heading' }, { id: 't', type: 'richText' }] } },
      { id: 'list', type: 'list', slots: { children: [{ id: 'inner', type: 'text' }] } },
    ],
  }
  const measurement: CanvasMeasurement = {
    blocks: [
      { id: 's', rect: rect(0) },
      { id: 'h', rect: rect(1) },
      { id: 't', rect: rect(2) },
      { id: 'list', rect: rect(3) },
      { id: 'inner', rect: rect(4) },
    ],
    slots: [],
    rootAxis: 'y',
    viewport: { width: 100, height: 100 },
    scroll: { x: 0, y: 0 },
    documentHeight: 100,
  }
  assert.deepEqual(contentRects(layout, measurement, 't').map((r) => r.y), [1, 4])
  assert.deepEqual(contentRects(layout, measurement, 'list').map((r) => r.y), [1, 2])
})
