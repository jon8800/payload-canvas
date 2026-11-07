import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks, linkField } from '../blocks'
import { contentFields, contentModeProblem, isContentField, isEditableItem } from './contentMode'
import { applyOperation, applyOperations } from './operations'
import { normalizeLayout } from './tree'
import type { BlockDefinition, Layout, Operation } from './types'
import { validateLayout } from './validate'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [{ name: 'as', type: 'select', options: ['div', 'section'] }], slots: { children: {} } },
  {
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text' },
      { name: 'level', type: 'select', options: ['1', '2'] },
    ],
  },
  {
    type: 'card',
    label: 'Card',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'image', type: 'upload', relationTo: 'media' },
      linkField(),
      // A text field that holds a setting.
      { name: 'anchor', type: 'text', admin: { custom: { builderContent: false } } },
      {
        name: 'stats',
        type: 'array',
        fields: [
          { name: 'label', type: 'text' },
          { name: 'icon', type: 'select', options: ['a', 'b'] },
        ],
      },
    ],
  },
]

const layout = (): Layout =>
  normalizeLayout({
    version: 1,
    blocks: [
      { id: 'h', type: 'heading', props: { text: 'Hello', level: '1' }, className: 'text-4xl' },
      {
        id: 'list',
        type: 'stack',
        editableItems: true,
        slots: {
          children: [
            { id: 'c1', type: 'card', className: 'p-4', props: { title: 'One', stats: [{ id: 'r1', label: 'Fast', icon: 'a' }] } },
            { id: 'c2', type: 'card', className: 'p-4', props: { title: 'Two' } },
          ],
        },
      },
      { id: 'other', type: 'stack', slots: { children: [{ id: 'x1', type: 'heading', props: { text: 'A' } }, { id: 'x2', type: 'heading', props: { text: 'B' } }] } },
    ],
  })

/** The content mode problem of applying `ops` to the fixture layout. */
function check(ops: Operation[], start: Layout = layout()): string | null {
  const result = applyOperations(start, ops, { blocks })
  assert.ok(result.ok, result.ok ? '' : result.error)
  return contentModeProblem(start, result.layout, blocks)
}

describe('content fields', () => {
  it('classifies props by field type, with the builderContent marker winning', () => {
    assert.equal(isContentField({ name: 't', type: 'text' }), true)
    assert.equal(isContentField({ name: 't', type: 'textarea' }), true)
    assert.equal(isContentField({ name: 't', type: 'richText' }), true)
    assert.equal(isContentField({ name: 't', type: 'upload', relationTo: 'media' }), true)
    assert.equal(isContentField(linkField()), true)
    assert.equal(isContentField({ name: 's', type: 'select', options: ['a'] }), false)
    assert.equal(isContentField({ name: 'c', type: 'checkbox' }), false)
    assert.equal(isContentField({ name: 'n', type: 'number' }), false)
    assert.equal(isContentField({ name: 't', type: 'text', admin: { custom: { builderContent: false } } }), false)
    assert.equal(isContentField({ name: 's', type: 'select', options: ['a'], admin: { custom: { builderContent: true } } }), true)
    // Arrays and groups: content only when every field inside is.
    assert.equal(isContentField({ name: 'a', type: 'array', fields: [{ name: 'label', type: 'text' }, linkField()] }), true)
    assert.equal(isContentField({ name: 'a', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'x', type: 'checkbox' }] }), false)
  })

  it('lists the content props of a block in order', () => {
    assert.deepEqual(
      contentFields(blocks[2]).map((f) => f.name),
      ['title', 'image', 'link'],
    )
  })

  it('treats the settings of the default blocks as design', () => {
    const defs = defaultBlocks()
    const names = (type: string) => contentFields(defs.find((d) => d.type === type)).map((f) => f.name)
    assert.deepEqual(names('heading'), ['text', 'accent'])
    assert.deepEqual(names('image'), ['image', 'alt'])
    assert.deepEqual(names('button'), ['label', 'link'])
    assert.deepEqual(names('field'), ['fallback'])
    assert.ok(!names('collectionList').includes('collection'))
  })
})

describe('contentModeProblem', () => {
  it('allows content changes: text, images, links, translations and inline text', () => {
    assert.equal(check([{ type: 'update', id: 'h', props: { text: 'Hi there' } }]), null)
    assert.equal(check([{ type: 'update', id: 'c1', props: { image: 7, link: { type: 'url', url: '/about' } } }]), null)
    assert.equal(check([{ type: 'update', id: 'c1', unsetProps: ['title'] }]), null)
    assert.equal(check([{ type: 'update', id: 'h', locale: 'de', props: { text: 'Hallo' } }]), null)
    // The content of a mixed array row may change; its settings may not.
    assert.equal(check([{ type: 'update', id: 'c1', props: { stats: [{ id: 'r1', label: 'Quick', icon: 'a' }] } }]), null)
  })

  it('refuses design changes', () => {
    assert.match(String(check([{ type: 'update', id: 'h', className: 'text-xl' }])), /design of "Heading"/)
    assert.match(String(check([{ type: 'update', id: 'h', props: { level: '2' } }])), /settings of "Heading"/)
    assert.match(String(check([{ type: 'update', id: 'c1', props: { anchor: 'top' } }])), /settings of "Card"/)
    assert.match(String(check([{ type: 'update', id: 'h', locale: 'de', props: { level: '2' } }])), /settings/)
    assert.match(String(check([{ type: 'update', id: 'c1', props: { stats: [{ id: 'r1', label: 'Fast', icon: 'b' }] } }])), /settings/)
    assert.match(String(check([{ type: 'update', id: 'c1', props: { stats: [] } }])), /settings/)
    assert.match(String(check([{ type: 'update', id: 'h', hidden: true }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'h', motion: { enter: { preset: 'fade' } } }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'h', bindings: { text: 'title' } }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'h', attrs: { id: 'top' } }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'h', label: 'Hero' }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'other', editableItems: true }])), /design/)
    assert.match(String(check([{ type: 'update', id: 'c1', props: { unknown: 1 } }])), /settings/)
  })

  it('refuses adding, deleting, duplicating and moving blocks outside a list editors manage', () => {
    assert.match(String(check([{ type: 'insert', block: { id: 'n', type: 'heading', props: { text: 'New' } }, to: { parentId: null, index: 0 } }])), /cannot be added/)
    assert.match(String(check([{ type: 'remove', id: 'h' }])), /cannot be deleted/)
    assert.match(String(check([{ type: 'remove', id: 'x1' }])), /cannot be deleted/)
    assert.match(String(check([{ type: 'duplicate', id: 'x1', newId: 'x3' }])), /cannot be added/)
    assert.match(String(check([{ type: 'move', id: 'x2', to: { parentId: 'other', index: 0 } }])), /cannot be moved/)
    assert.match(String(check([{ type: 'move', id: 'h', to: { parentId: null, index: 2 } }])), /cannot be moved/)
    // Into or out of a managed list is a move to another list.
    assert.match(String(check([{ type: 'move', id: 'x1', to: { parentId: 'list', index: 0 } }])), /cannot be moved/)
    assert.match(String(check([{ type: 'move', id: 'c1', to: { parentId: 'other', index: 0 } }])), /cannot be moved/)
    // Deleting the list itself.
    assert.match(String(check([{ type: 'remove', id: 'list' }])), /cannot be deleted/)
  })

  it('lets editors duplicate, delete and reorder the items of a list they manage', () => {
    assert.equal(check([{ type: 'duplicate', id: 'c1', newId: 'c3' }]), null)
    assert.equal(check([{ type: 'remove', id: 'c2' }]), null)
    assert.equal(check([{ type: 'move', id: 'c2', to: { parentId: 'list', index: 0 } }]), null)
    // A copy whose text changed in the same batch is still a copy.
    assert.equal(check([{ type: 'duplicate', id: 'c2', newId: 'c3' }, { type: 'update', id: 'c3', props: { title: 'Three' } }]), null)
    // An item restyled, or a new block that is not a copy of an item: refused.
    assert.match(String(check([{ type: 'update', id: 'c1', className: 'p-8' }])), /design/)
    assert.match(String(check([{ type: 'insert', block: { id: 'n', type: 'card', className: 'p-8' }, to: { parentId: 'list', index: 0 } }])), /only copies/)
    assert.match(String(check([{ type: 'insert', block: { id: 'n', type: 'heading' }, to: { parentId: 'list', index: 0 } }])), /only copies/)
    assert.match(String(check([{ type: 'duplicate', id: 'c1', newId: 'c3' }, { type: 'update', id: 'c3', className: 'p-8' }])), /only copies/)
  })

  it('knows which blocks are items of a list editors manage', () => {
    const start = layout()
    assert.equal(isEditableItem(start, 'c1'), true)
    assert.equal(isEditableItem(start, 'x1'), false)
    assert.equal(isEditableItem(start, 'list'), false)
    assert.equal(isEditableItem(start, 'missing'), false)
  })
})

describe('editableItems flag', () => {
  it('is set and cleared by update operations, with an exact undo, and stored only when true', () => {
    const start = layout()
    const on = applyOperation(start, { type: 'update', id: 'other', editableItems: true })
    assert.ok(on.ok)
    assert.equal(on.layout.blocks[2].editableItems, true)
    const undo = applyOperations(on.layout, on.inverse)
    assert.ok(undo.ok)
    assert.deepEqual(undo.layout, start)
    const off = applyOperation(start, { type: 'update', id: 'list', editableItems: false })
    assert.ok(off.ok)
    assert.equal('editableItems' in off.layout.blocks[1], false)
    assert.equal(normalizeLayout({ blocks: [{ id: 'a', type: 'stack', editableItems: false }] }).blocks[0].editableItems, undefined)
    assert.equal(applyOperation(start, { type: 'update', id: 'list', editableItems: 'yes' as never }).ok, false)
  })

  it('is valid layout data', () => {
    assert.deepEqual(validateLayout(layout(), blocks), [])
    const bad = validateLayout({ version: 1, blocks: [{ id: 'a', type: 'stack', editableItems: 'yes' as never }] }, blocks)
    assert.ok(bad.some((e) => e.path.endsWith('editableItems')))
  })
})
