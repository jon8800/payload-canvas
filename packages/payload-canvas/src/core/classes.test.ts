import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { collectClasses } from './classes'
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
