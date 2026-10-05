import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout } from '../../../core/types'
import { dismissMenus, onDismissMenus } from './dismiss'
import { keyCaps, keyText } from './keys'
import { menuPointIn } from './requests'
import { normalizeClasses, parseStyles, setStylesOps, stylesText } from './styleClipboard'

const blocks: BlockDefinition[] = [
  { type: 'heading', label: 'Heading', fields: [] },
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'embed', label: 'Embed', fields: [], styles: false },
]

const layout: Layout = {
  version: 1,
  blocks: [
    {
      id: 's',
      type: 'stack',
      className: 'flex gap-4 md:flex-row',
      motion: { enter: { preset: 'fade-up', stagger: 80 } },
      slots: { children: [{ id: 'h', type: 'heading', className: 'text-xl hover:underline' }, { id: 'e', type: 'embed' }] },
    },
    { id: 'h2', type: 'heading' },
  ],
}

describe('style clipboard', () => {
  it('round-trips classes with variants', () => {
    assert.deepEqual(parseStyles(stylesText('text-xl  md:text-2xl hover:underline')), { className: 'text-xl md:text-2xl hover:underline', motion: null })
    assert.deepEqual(parseStyles(stylesText(undefined)), { className: '', motion: null })
  })

  it('round-trips animations', () => {
    const motion = { enter: { preset: 'fade-up' as const, duration: 800 }, hover: { preset: 'lift' as const } }
    assert.deepEqual(parseStyles(stylesText('p-4', motion)), { className: 'p-4', motion })
  })

  it('reads a copy from before animations without motion', () => {
    assert.deepEqual(parseStyles('{"marker":"payload-builder/styles@1","className":"p-4"}'), { className: 'p-4' })
  })

  it('ignores text that is not copied styles', () => {
    assert.equal(parseStyles(null), null)
    assert.equal(parseStyles('flex gap-4'), null)
    assert.equal(parseStyles('{"marker":"payload-builder/styles@1"}'), null)
    assert.equal(parseStyles('payload-builder/styles@1 {'), null)
  })

  it('normalizes spaces and drops repeated classes', () => {
    assert.equal(normalizeClasses('  p-4 p-4	md:p-8 '), 'p-4 md:p-8')
    assert.equal(normalizeClasses(null), '')
  })

  it('builds one update per changed block and skips blocks without style controls', () => {
    const ops = setStylesOps(layout, blocks, ['h', 'h2', 'e', 'missing', 'h2'], { className: 'flex gap-4 md:flex-row' })
    assert.deepEqual(ops, [
      { type: 'update', id: 'h', className: 'flex gap-4 md:flex-row' },
      { type: 'update', id: 'h2', className: 'flex gap-4 md:flex-row' },
    ])
  })

  it('skips blocks that already have the classes, and empty classes remove the className', () => {
    assert.deepEqual(setStylesOps(layout, blocks, ['s'], { className: ' flex  gap-4 md:flex-row' }), [])
    assert.deepEqual(setStylesOps(layout, blocks, ['s', 'h2'], { className: '' }), [{ type: 'update', id: 's', className: null }])
  })

  it('replaces the animations: copied kinds set, the others removed', () => {
    const ops = setStylesOps(layout, blocks, ['s', 'h'], { className: 'flex gap-4 md:flex-row', motion: { hover: { preset: 'grow' } } })
    assert.deepEqual(ops, [
      { type: 'update', id: 's', motion: { enter: null, hover: { preset: 'grow' }, press: null, scroll: null, loop: null } },
      { type: 'update', id: 'h', className: 'flex gap-4 md:flex-row', motion: { enter: null, hover: { preset: 'grow' }, press: null, scroll: null, loop: null } },
    ])
  })

  it('removes the animations when the copied block had none, and skips blocks that match', () => {
    assert.deepEqual(setStylesOps(layout, blocks, ['s', 'h2'], { className: 'flex gap-4 md:flex-row', motion: null }), [
      { type: 'update', id: 's', motion: null },
      { type: 'update', id: 'h2', className: 'flex gap-4 md:flex-row' },
    ])
  })

  it('leaves the animations alone for an old copy without motion', () => {
    assert.deepEqual(setStylesOps(layout, blocks, ['s'], { className: '' }), [{ type: 'update', id: 's', className: null }])
  })
})

describe('key hints', () => {
  it('uses the platform modifier keys', () => {
    assert.equal(keyText(['mod', 'alt', 'C'], false), 'Ctrl+Alt+C')
    assert.equal(keyText(['mod', 'alt', 'C'], true), '⌘⌥C')
    assert.deepEqual(keyCaps(['shift', 'F10'], false), ['Shift', 'F10'])
  })
})

describe('menuPointIn', () => {
  const view = { width: 800, height: 600 }
  it('opens near the top left corner of the block', () => {
    assert.deepEqual(menuPointIn({ x: 100, y: 50, width: 200, height: 100 }, view), { x: 108, y: 58 })
  })
  it('stays in view when the block starts above or left of the view', () => {
    assert.deepEqual(menuPointIn({ x: -40, y: -300, width: 900, height: 2000 }, view), { x: 8, y: 8 })
  })
  it('stays in view when the block starts below the view', () => {
    assert.deepEqual(menuPointIn({ x: 0, y: 900, width: 100, height: 100 }, view), { x: 8, y: 592 })
  })
})

describe('dismissMenus', () => {
  it('calls every listener until it unsubscribes', () => {
    let calls = 0
    const off = onDismissMenus(() => calls++)
    dismissMenus()
    off()
    dismissMenus()
    assert.equal(calls, 1)
  })
})
