import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { placeTooltip } from './place'

const viewport = { width: 1000, height: 600 }
const tip = { width: 100, height: 20 }

describe('placeTooltip', () => {
  it('goes under the element, centered', () => {
    assert.deepEqual(placeTooltip({ left: 200, top: 100, width: 40, height: 20 }, tip, viewport), { left: 170, top: 126, side: 'bottom' })
  })

  it('flips above when there is no room below', () => {
    assert.deepEqual(placeTooltip({ left: 200, top: 570, width: 40, height: 20 }, tip, viewport), { left: 170, top: 544, side: 'top' })
  })

  it('stays inside the viewport near the right edge', () => {
    assert.equal(placeTooltip({ left: 980, top: 100, width: 20, height: 20 }, tip, viewport).left, 894)
  })

  it('goes right of the element, and left or below when the right has no room', () => {
    assert.deepEqual(placeTooltip({ left: 0, top: 100, width: 200, height: 30 }, tip, viewport, 'right'), { left: 206, top: 105, side: 'right' })
    assert.equal(placeTooltip({ left: 600, top: 100, width: 350, height: 30 }, tip, viewport, 'right').side, 'left')
    assert.equal(placeTooltip({ left: 50, top: 100, width: 900, height: 30 }, tip, viewport, 'right').side, 'bottom')
  })
})
