import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { CanvasMeasurement } from '@payload-toolkit/builder/core'
import { sameMeasurement } from './measure'

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
