import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { blockParts, collectClasses, defaultPartClassNames } from './classes'
import type { BlockDefinition, Layout } from './types'

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'a', type: 'card', className: 'p-4 rounded' },
    {
      id: 's',
      type: 'stack',
      className: 'flex',
      slots: { children: [{ id: 'f', type: 'form', hidden: true }] },
    },
  ],
}

const blocks: BlockDefinition[] = [
  { type: 'card', label: 'Card', fields: [], classes: ['shadow-sm', 'rounded  hover:shadow-md'] },
  { type: 'form', label: 'Form', fields: [], classes: ['bg-primary', 'focus-visible:ring-2'] },
  { type: 'unused', label: 'Unused', fields: [], classes: ['text-red-500'] },
  { type: 'stack', label: 'Stack', fields: [] },
]

describe('collectClasses with block definitions', () => {
  it('adds the classes of every block type in the layout, hidden blocks too', () => {
    assert.deepEqual(collectClasses(layout, blocks), [
      'bg-primary',
      'flex',
      'focus-visible:ring-2',
      'hover:shadow-md',
      'p-4',
      'rounded',
      'shadow-sm',
    ])
  })

  it('ignores types that are not in the layout and works without definitions', () => {
    assert.ok(!collectClasses(layout, blocks).includes('text-red-500'))
    assert.deepEqual(collectClasses(layout), ['flex', 'p-4', 'rounded'])
    assert.deepEqual(collectClasses({ version: 1, blocks: [] }, blocks), [])
  })

  it('skips bad class entries from JSON configs', () => {
    const loose = [{ type: 'card', label: 'Card', fields: [], classes: ['ok', 3, null] }] as unknown as BlockDefinition[]
    assert.deepEqual(collectClasses({ version: 1, blocks: [{ id: 'c', type: 'card' }] }, loose), ['ok'])
  })
})

describe('parts', () => {
  const carousel: BlockDefinition = {
    type: 'carousel',
    label: 'Carousel',
    fields: [],
    slots: { slides: { label: 'Slides', styles: true, defaultClassName: 'gap-4' }, next: { label: 'Next' } },
    parts: { arrow: { label: 'Arrows', defaultClassName: 'size-10 rounded-full' }, dot: { label: 'Dots' }, slides: { label: 'Ignored' } },
  }

  it('lists styled slots first, then the parts, without part names that are slots', () => {
    assert.deepEqual(blockParts(carousel), [
      { name: 'slides', label: 'Slides', slot: true, defaultClassName: 'gap-4' },
      { name: 'arrow', label: 'Arrows', slot: false, defaultClassName: 'size-10 rounded-full' },
      { name: 'dot', label: 'Dots', slot: false },
    ])
    assert.deepEqual(blockParts(undefined), [])
  })

  it('gives a new block the default classes of its parts', () => {
    assert.deepEqual(defaultPartClassNames(carousel), { slides: 'gap-4', arrow: 'size-10 rounded-full' })
    assert.equal(defaultPartClassNames({ slots: {} }), null)
  })

  it('compiles the classes of every part', () => {
    const list: Layout = { version: 1, blocks: [{ id: 'c', type: 'carousel', partClassName: { arrow: 'bg-white', slides: 'gap-4' } }] }
    assert.deepEqual(collectClasses(list, [carousel]), ['bg-white', 'gap-4'])
  })
})
