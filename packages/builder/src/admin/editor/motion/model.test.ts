import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { patchMotion } from '../../../core'
import { clamp, enterValues, fromPercent, loopValues, replaceMotionPatch, toPercent, withPreset, withValue } from './model'

describe('withPreset', () => {
  it('keeps the entrance settings and drops the distance for presets that do not travel', () => {
    assert.deepEqual(withPreset('enter', { preset: 'fade-up', distance: 40, duration: 800 }, 'fade-left'), {
      preset: 'fade-left',
      distance: 40,
      duration: 800,
    })
    assert.deepEqual(withPreset('enter', { preset: 'fade-up', distance: 40, duration: 800, stagger: 80 }, 'zoom-in'), {
      preset: 'zoom-in',
      duration: 800,
      stagger: 80,
    })
  })

  it('starts a new kind with only the preset', () => {
    assert.deepEqual(withPreset('hover', undefined, 'lift'), { preset: 'lift' })
  })

  it('keeps only the number the new hover, scroll or loop preset uses', () => {
    assert.deepEqual(withPreset('hover', { preset: 'lift', distance: 8 }, 'grow'), { preset: 'grow' })
    assert.deepEqual(withPreset('scroll', { preset: 'parallax', distance: 100 }, 'fade'), { preset: 'fade' })
    assert.deepEqual(withPreset('loop', { preset: 'float', duration: 2000, distance: 12 }, 'pulse'), { preset: 'pulse', duration: 2000 })
  })
})

describe('withValue', () => {
  it('sets and removes one setting', () => {
    assert.deepEqual(withValue<'enter'>({ preset: 'fade' }, 'delay', 200), { preset: 'fade', delay: 200 })
    assert.deepEqual(withValue<'enter'>({ preset: 'fade', repeat: true }, 'repeat', undefined), { preset: 'fade' })
  })
})

describe('replaceMotionPatch', () => {
  it('sets the copied kinds and removes the others', () => {
    const patch = replaceMotionPatch({ enter: { preset: 'fade' }, hover: { preset: 'lift' } })
    assert.deepEqual(patch, { enter: { preset: 'fade' }, hover: { preset: 'lift' }, press: null, scroll: null, loop: null })
    const before = { enter: { preset: 'zoom-in' as const }, loop: { preset: 'pulse' as const } }
    assert.deepEqual(patchMotion(before, patch), { enter: { preset: 'fade' }, hover: { preset: 'lift' } })
  })

  it('removes all motion for a block without motion', () => {
    assert.equal(replaceMotionPatch(undefined), null)
  })
})

describe('control values', () => {
  it('fills in the defaults', () => {
    assert.deepEqual(enterValues({ preset: 'fade-up' }), {
      duration: 600,
      delay: 0,
      easing: 'ease-out',
      distance: 24,
      trigger: 'view',
      amount: 0.2,
      repeat: false,
      stagger: 0,
    })
    assert.equal(loopValues({ preset: 'pulse' }).duration, 1500)
    assert.equal(loopValues({ preset: 'float' }).duration, 3000)
  })

  it('converts percents without float noise', () => {
    assert.equal(toPercent(1.03), 103)
    assert.equal(toPercent(0.2), 20)
    assert.equal(fromPercent(103), 1.03)
    assert.equal(fromPercent(97), 0.97)
    assert.equal(clamp(5000, 100, 2000), 2000)
  })
})
