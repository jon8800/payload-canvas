import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_FEATURES } from './config.js'
import { featuresFromFlags } from './options.js'

describe('featuresFromFlags', () => {
  it('uses the defaults without flags: the media gallery and Google reviews stay off', () => {
    const { features, decided } = featuresFromFlags({})
    assert.deepEqual(features, DEFAULT_FEATURES)
    assert.ok(features.includes('workflows'))
    assert.ok(!features.includes('gallery'))
    assert.ok(!features.includes('reviews'))
    assert.equal(decided.size, 0)
  })

  it('turns features on with --<id> and off with --no-<id>', () => {
    const { features, decided } = featuresFromFlags({ 'no-gallery': true, 'no-workflows': true, reviews: true })
    assert.ok(!features.includes('gallery'))
    assert.ok(!features.includes('workflows'))
    assert.ok(features.includes('reviews'))
    assert.deepEqual([...decided].sort(), ['gallery', 'reviews', 'workflows'])
  })

  it('rejects both flags for one feature', () => {
    assert.throws(() => featuresFromFlags({ reviews: true, 'no-reviews': true }), /cannot be used together/)
  })
})
