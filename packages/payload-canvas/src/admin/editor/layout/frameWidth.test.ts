import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MIN_CANVAS_WIDTH } from '../styles/viewport'
import { resizedWidth } from './frameWidth'

describe('resizedWidth', () => {
  const start = { width: 800, zoom: 1, side: 1 as const, space: 1200 }

  it('moves both edges: the width changes by twice the pointer distance', () => {
    assert.equal(resizedWidth(start, 50), 900)
    assert.equal(resizedWidth({ ...start, side: -1 }, 50), 700)
    assert.equal(resizedWidth({ ...start, side: -1 }, -50), 900)
  })

  it('counts screen pixels at the zoom', () => {
    assert.equal(resizedWidth({ ...start, zoom: 0.5 }, 50), 1000)
  })

  it('stays between the smallest width and the stage', () => {
    assert.equal(resizedWidth(start, -1000), MIN_CANVAS_WIDTH)
    assert.equal(resizedWidth(start, 1000), 1200)
    assert.equal(resizedWidth({ ...start, zoom: 0.5 }, 1000), 2400)
  })

  it('snaps to the nearest width in reach', () => {
    assert.equal(resizedWidth(start, -10, [768, 1024]), 768)
    assert.equal(resizedWidth(start, -40, [768]), 720)
    assert.equal(resizedWidth(start, 100, [1024, 1280]), 1024)
  })

  it('never snaps past the stage', () => {
    assert.equal(resizedWidth({ ...start, space: 1270 }, 230, [1280]), 1260)
  })
})
