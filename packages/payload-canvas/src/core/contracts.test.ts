// Block labels, slot `disallow` rules, readable layout problems and binding checks.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { linkField } from '../blocks/link'
import { titleOf, validateBindings } from './bindings'
import { blockName, placementError, slotAcceptsAt } from './blocks'
import { canvasDropTarget } from './dropTarget'
import { describeLayoutErrors, summarizeProblems } from './issues'
import { applyOperation, applyOperations } from './operations'
import { blockJsonSchema } from './schema'
import { findBlock, normalizeLayout } from './tree'
import type { BindingField, BlockDefinition, CanvasMeasurement, Layout } from './types'
import { isBlockingError, validateLayout } from './validate'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  {
    type: 'link',
    label: 'Link',
    fields: [linkField()] as Field[],
    slots: { children: { label: 'Content', disallow: ['link', 'button', 'form'] } },
  },
  { type: 'button', label: 'Button', fields: [{ name: 'label', type: 'text', required: true }, linkField()] as Field[] },
  { type: 'form', label: 'Form', fields: [{ name: 'form', type: 'relationship', relationTo: 'forms', required: true }] as Field[] },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text', label: 'Text', required: true }] as Field[] },
  { type: 'image', label: 'Image', fields: [{ name: 'image', type: 'upload', relationTo: 'media', required: true }] as Field[] },
  {
    type: 'video',
    label: 'Video',
    fields: [
      { name: 'url', type: 'text', label: 'Source URL', required: true },
      { name: 'count', type: 'number', label: 'Number of items', max: 10 },
    ] as Field[],
  },
  {
    type: 'collectionList',
    label: 'Collection list',
    fields: [{ name: 'collection', type: 'text' }] as Field[],
    slots: { item: {} },
  },
]

const layout: Layout = {
  version: 1,
  blocks: [
    {
      id: 'hero',
      type: 'stack',
      label: 'Hero',
      slots: {
        children: [
          { id: 'card', type: 'link', slots: { children: [{ id: 'inner', type: 'stack' }] } },
          { id: 'h', type: 'heading', props: { text: 'Hi' } },
        ],
      },
    },
  ],
}

describe('block labels', () => {
  it('normalizes: trimmed, empty labels dropped', () => {
    const out = normalizeLayout({ blocks: [{ id: 'a', type: 'stack', label: '  Hero ' }, { id: 'b', type: 'stack', label: '  ' }] })
    assert.equal(out.blocks[0].label, 'Hero')
    assert.ok(!('label' in out.blocks[1]))
  })
  it('updates and undoes a label', () => {
    const result = applyOperation(layout, { type: 'update', id: 'h', label: ' Title ' })
    assert.ok(result.ok)
    assert.equal(findBlock(result.layout, 'h')?.label, 'Title')
    assert.deepEqual(result.inverse, [{ type: 'update', id: 'h', label: null }])
    const undone = applyOperations(result.layout, result.inverse)
    assert.ok(undone.ok)
    assert.deepEqual(undone.layout, layout)
    const cleared = applyOperation(layout, { type: 'update', id: 'hero', label: '' })
    assert.ok(cleared.ok)
    assert.ok(!('label' in findBlock(cleared.layout, 'hero')!))
    assert.deepEqual(cleared.inverse, [{ type: 'update', id: 'hero', label: 'Hero' }])
  })
  it('is valid, in the schema and used as the block name', () => {
    assert.deepEqual(validateLayout(layout, blocks).filter((e) => e.path.endsWith('.label')), [])
    assert.ok((blockJsonSchema(blocks[0], blocks).properties as Record<string, unknown>).label)
    assert.equal(blockName({ type: 'stack', label: 'Hero' }, blocks), 'Hero')
    assert.equal(blockName({ type: 'stack' }, blocks), 'Stack')
  })
})

describe('slot disallow at any depth', () => {
  it('refuses a type anywhere inside the slot, with a readable reason', () => {
    assert.equal(placementError(blocks, layout, 'card', 'children', 'button'), 'Button cannot go inside Link')
    assert.equal(placementError(blocks, layout, 'inner', 'children', 'form'), 'Form cannot go inside Link')
    assert.equal(placementError(blocks, layout, 'inner', 'children', 'heading'), null)
    assert.ok(slotAcceptsAt(blocks, layout, 'hero', 'children', 'button'))
    assert.ok(slotAcceptsAt(blocks, layout, null, 'children', 'link'))
  })
  it('checks the whole placed subtree', () => {
    const wrapped = { id: 'w', type: 'stack', slots: { children: [{ id: 'b', type: 'button', props: { label: 'Go' } }] } }
    assert.equal(placementError(blocks, layout, 'card', 'children', wrapped), 'Stack contains Button, which cannot go inside Link')
  })
  it('insert and move follow the rules when given block definitions', () => {
    const insert = { type: 'insert' as const, block: { id: 'x', type: 'button' }, to: { parentId: 'inner', index: 0 } }
    assert.ok(applyOperation(layout, insert).ok, 'no definitions: shape only')
    const refused = applyOperation(layout, insert, { blocks })
    assert.deepEqual(refused, { ok: false, error: 'Button cannot go inside Link' })
    const withLink = applyOperation(layout, { type: 'insert', block: { id: 'l2', type: 'link' }, to: { parentId: 'hero', index: 0 } }, { blocks })
    assert.ok(withLink.ok)
    const move = applyOperation(withLink.layout, { type: 'move', id: 'l2', to: { parentId: 'inner', index: 0 } }, { blocks })
    assert.equal(move.ok, false)
  })
  it('drop targets skip refused slots', () => {
    const measurement: CanvasMeasurement = {
      blocks: [
        { id: 'hero', rect: { x: 0, y: 0, width: 400, height: 400 } },
        { id: 'card', rect: { x: 0, y: 0, width: 400, height: 200 } },
        { id: 'inner', rect: { x: 20, y: 20, width: 360, height: 160 } },
        { id: 'h', rect: { x: 0, y: 200, width: 400, height: 200 } },
      ],
      slots: [{ ownerId: 'inner', slot: 'children', rect: { x: 20, y: 20, width: 360, height: 160 }, axis: 'y', empty: true }],
      rootAxis: 'y',
      viewport: { width: 400, height: 400 },
      scroll: { x: 0, y: 0 },
      documentHeight: 400,
    }
    const button = canvasDropTarget(layout, blocks, measurement, { x: 200, y: 100 }, { kind: 'new', blockType: 'button' })
    assert.notEqual(button?.to.parentId, 'inner')
    assert.notEqual(button?.to.parentId, 'card')
    const heading = canvasDropTarget(layout, blocks, measurement, { x: 200, y: 100 }, { kind: 'new', blockType: 'heading' })
    assert.equal(heading?.to.parentId, 'inner')
  })
  it('validation reports nesting at any depth, blocking only publishing', () => {
    const bad: Layout = {
      version: 1,
      blocks: [{ id: 'l', type: 'link', slots: { children: [{ id: 's', type: 'stack', slots: { children: [{ id: 'f', type: 'form', props: { form: 1 } }] } }] } }],
    }
    const errors = validateLayout(bad, blocks)
    assert.deepEqual(errors.map((e) => [e.blockId, e.code, e.message]), [['f', 'nesting', 'Form cannot go inside Link']])
    assert.equal(isBlockingError(errors[0], false), false)
    assert.equal(isBlockingError(errors[0], true), true)
  })
})

describe('readable layout problems', () => {
  it('names the block and says what to do, without raw paths', () => {
    const page: Layout = {
      version: 1,
      blocks: [
        {
          id: 'hero',
          type: 'stack',
          label: 'Hero',
          slots: {
            children: [
              { id: 'img', type: 'image' },
              { id: 'vid', type: 'video', props: { count: 50 } },
              { id: 'frm', type: 'form' },
            ],
          },
        },
      ],
    }
    const issues = describeLayoutErrors(page, validateLayout(page, blocks), blocks)
    assert.deepEqual(
      issues.map((i) => [i.blockId, i.message, i.where]),
      [
        ['img', 'Image: choose an image', 'Hero'],
        ['vid', 'Video: fill in source URL', 'Hero'],
        ['vid', 'Video: Number of items must be at most 10', 'Hero'],
        ['frm', 'Form: choose a form', 'Hero'],
      ],
    )
    assert.ok(issues.every((i) => !i.message.includes('blocks[')))
    assert.ok(issues.every((i) => i.path.startsWith('blocks[0]')), 'raw path kept in `path`')
  })
  it('drops duplicates', () => {
    const page: Layout = { version: 1, blocks: [{ id: 'img', type: 'image' }] }
    const errors = validateLayout(page, blocks)
    assert.equal(describeLayoutErrors(page, [...errors, ...errors], blocks).length, 1)
  })
  it('summarizes in one line', () => {
    assert.equal(summarizeProblems({ blockIds: ['a', 'b', 'a'] }), '2 blocks need attention.')
    assert.equal(summarizeProblems({ blockIds: ['a'] }), '1 block needs attention.')
    assert.equal(summarizeProblems({ blockIds: [], fields: ['Title'] }), 'Title needs attention.')
    assert.equal(summarizeProblems({ blockIds: ['a'], fields: ['Title', 'Slug'] }), 'Title, Slug and 1 block need attention.')
  })
})

const template = (bindings: Record<string, string>): Layout => ({
  version: 1,
  blocks: [{ id: 'b', type: 'button', props: { label: 'Read' }, bindings }],
})

describe('binding checks', () => {
  const sources: Record<string, BindingField[]> = {
    posts: [
      { path: '$url', label: 'Page URL', type: 'text' },
      { path: 'title', label: 'Title', type: 'text' },
      { path: 'website', label: 'Website', type: 'text' },
      { path: 'content', label: 'Content', type: 'richText' },
    ],
  }
  it('a link takes only a URL', () => {
    assert.deepEqual(validateBindings(template({ link: '$url' }), blocks, sources, 'posts'), [])
    assert.deepEqual(validateBindings(template({ 'link.url': 'website' }), blocks, sources, 'posts'), [])
    const bad = validateBindings(template({ link: 'title' }), blocks, sources, 'posts')
    assert.equal(bad.length, 1)
    assert.equal(bad[0].code, 'binding')
    const [issue] = describeLayoutErrors(template({ link: 'title' }), bad, blocks)
    assert.equal(issue.message, 'Button: a link can use only the page URL or a URL field (bound to "title")')
  })
  it('one-line text cannot show rich text', () => {
    const heading: Layout = { version: 1, blocks: [{ id: 'h', type: 'heading', bindings: { text: 'content' } }] }
    assert.equal(validateBindings(heading, blocks, sources, 'posts')[0]?.code, 'binding')
  })
  it('collection list items read the listed collection', () => {
    const list: Layout = {
      version: 1,
      blocks: [{ id: 'l', type: 'collectionList', props: { collection: 'posts' }, slots: { item: [{ id: 'b', type: 'button', bindings: { link: 'title' } }] } }],
    }
    assert.equal(validateBindings(list, blocks, sources, null).length, 1)
  })
})

describe('privacy', () => {
  it('a document title never falls back to an email', () => {
    assert.equal(titleOf({ id: 4, email: 'a@b.c' }), '4')
    assert.equal(titleOf({ id: 4, name: 'Ada', email: 'a@b.c' }), 'Ada')
  })
})
