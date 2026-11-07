import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { CanvasMeasurement } from '../../core'
import { clipRect, sameMeasurement, unionRect } from './measure'

const rect = (y: number) => ({ x: 0, y, width: 100, height: 20 })
const measurement = (scrollY = 0, y = 10): CanvasMeasurement => ({
  blocks: [{ id: 'a', rect: rect(y) }],
  slots: [{ ownerId: 'a', slot: 'children', rect: rect(y), axis: 'y', empty: true }],
  rootAxis: 'y',
  viewport: { width: 800, height: 600 },
  scroll: { x: 0, y: scrollY },
  documentHeight: 1000,
})

test('equal measurements are the same; any change is not', () => {
  assert.equal(sameMeasurement(measurement(), measurement()), true)
  assert.equal(sameMeasurement(null, measurement()), false)
  assert.equal(sameMeasurement(measurement(0), measurement(5)), false)
  assert.equal(sameMeasurement(measurement(0, 10), measurement(0, 11)), false)
  const other = measurement()
  other.slots[0] = { ...other.slots[0], empty: false }
  assert.equal(sameMeasurement(measurement(), other), false)
  const more = measurement()
  more.blocks.push({ id: 'b', rect: rect(40) })
  assert.equal(sameMeasurement(measurement(), more), false)
})

test('unionRect: the box around the rects that have a size', () => {
  assert.deepEqual(unionRect([{ x: 10, y: 10, width: 20, height: 20 }, { x: 0, y: 40, width: 5, height: 5 }, { x: 99, y: 99, width: 0, height: 0 }]), { x: 0, y: 10, width: 30, height: 35 })
  assert.equal(unionRect([{ x: 1, y: 1, width: 0, height: 0 }]), null)
})

test('clipRect: the visible part of a rect inside a clipping area', () => {
  const area = { left: 0, top: -Infinity, right: 300, bottom: Infinity }
  // Inside: unchanged (the same object).
  const inside = { x: 10, y: 500, width: 100, height: 50 }
  assert.equal(clipRect(inside, area), inside)
  // A slide half out of the viewport.
  assert.deepEqual(clipRect({ x: 250, y: 0, width: 100, height: 50 }, area), { x: 250, y: 0, width: 50, height: 50 })
  // A slide out of view: empty, on the area's edge.
  assert.deepEqual(clipRect({ x: 400, y: 0, width: 100, height: 50 }, area), { x: 300, y: 0, width: 0, height: 50 })
  assert.equal(clipRect(inside, null), inside)
})

test('a popup that opens, moves or holds other blocks changes the measurement', () => {
  const open = (y: number): CanvasMeasurement => ({ ...measurement(), layers: [{ ownerId: 'a', rect: rect(y) }] })
  assert.equal(sameMeasurement(open(10), open(10)), true)
  assert.equal(sameMeasurement(measurement(), open(10)), false)
  assert.equal(sameMeasurement(open(10), open(12)), false)
  const inLayer = open(10)
  inLayer.blocks[0] = { ...inLayer.blocks[0]!, layer: 0 }
  assert.equal(sameMeasurement(open(10), inLayer), false)
})
