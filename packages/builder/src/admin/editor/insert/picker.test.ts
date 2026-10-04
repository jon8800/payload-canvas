import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { BlockDefinition, Layout, SectionDefinition } from '../../../core/types'
import { pickerItems } from './picker'

const blocks: BlockDefinition[] = [
  { type: 'heading', label: 'Heading', fields: [], category: 'Content' },
  { type: 'stack', label: 'Stack', fields: [], category: 'Layout', slots: { children: {} } },
  { type: 'button', label: 'Button', fields: [], category: 'Interactive' },
  {
    type: 'link',
    label: 'Link',
    fields: [],
    category: 'Interactive',
    slots: { children: { disallow: ['link', 'button'] } },
  },
]

const layout: Layout = { version: 1, blocks: [{ id: 'l', type: 'link' }] }

const sections: SectionDefinition[] = [
  { id: 'hero', label: 'Hero', category: 'Heroes', blocks: [{ id: 'h1', type: 'heading' }] },
  { id: 'cta', label: 'Call to action', blocks: [{ id: 's1', type: 'stack', slots: { children: [{ id: 'b1', type: 'button' }] } }] },
  { id: 'saved:3', label: 'Team intro', blocks: [{ id: 'h2', type: 'heading' }], savedId: 3 },
]

describe('pickerItems', () => {
  it('lists blocks by category, then sections with saved ones first', () => {
    const items = pickerItems({ blocks, sections, layout, parentId: null, slot: 'children', query: '' })
    assert.deepEqual(
      items.map((i) => i.id),
      ['block:stack', 'block:heading', 'block:button', 'block:link', 'section:saved:3', 'section:hero', 'section:cta'],
    )
    assert.equal(items.find((i) => i.id === 'section:saved:3')?.hint, 'Saved')
  })

  it('leaves out what the slot refuses, also deep inside a section', () => {
    const items = pickerItems({ blocks, sections, layout, parentId: 'l', slot: 'children', query: '' })
    assert.deepEqual(
      items.map((i) => i.id),
      ['block:stack', 'block:heading', 'section:saved:3', 'section:hero'],
    )
  })

  it('filters by the search text', () => {
    const items = pickerItems({ blocks, sections, layout, parentId: null, slot: 'children', query: 'he' })
    assert.deepEqual(items.map((i) => i.id), ['block:heading', 'section:hero'])
    // Names that start with the text come before other matches.
    const ranked = pickerItems({
      blocks: [{ type: 'stack', label: 'Stack', fields: [], category: 'Layout', ai: { description: 'Holds a heading' } }, ...blocks],
      sections: [],
      layout,
      parentId: null,
      slot: 'children',
      query: 'head',
    })
    assert.deepEqual(ranked.map((i) => i.id).slice(0, 2), ['block:heading', 'block:stack'])
    const saved = pickerItems({ blocks, sections, layout, parentId: null, slot: 'children', query: 'saved' })
    assert.deepEqual(saved.map((i) => i.id), ['section:saved:3'])
  })
})
