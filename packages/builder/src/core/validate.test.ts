import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import type { BlockDefinition } from './types'
import { validateLayout } from './validate'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  { type: 'row', label: 'Row', fields: [], slots: { children: { allow: ['text'] } } },
  {
    type: 'heading',
    label: 'Heading',
    fields: [
      { name: 'text', type: 'text', required: true },
      { name: 'level', type: 'select', options: ['1', '2', '3'] },
    ] as Field[],
  },
  { type: 'text', label: 'Text', fields: [{ name: 'text', type: 'textarea' }] as Field[], styles: false },
  {
    type: 'kitchen',
    label: 'Kitchen sink',
    fields: [
      { name: 'n', type: 'number', max: 5 },
      { name: 'flag', type: 'checkbox' },
      { name: 'when', type: 'date' },
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'link', type: 'relationship', relationTo: ['pages', 'posts'] },
      { name: 'posts', type: 'relationship', relationTo: 'posts', hasMany: true },
      { name: 'content', type: 'richText' },
      { name: 'where', type: 'point' },
      { name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text', required: true }] },
      { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text' }] },
      { type: 'tabs', tabs: [{ name: 'meta', fields: [{ name: 'note', type: 'text' }] }] },
      { name: 'data', type: 'json' },
    ] as Field[],
  },
]

function paths(layout: unknown): string[] {
  return validateLayout(layout, blocks).map((e) => e.path)
}

describe('validateLayout', () => {
  it('accepts a valid layout', () => {
    const errors = validateLayout(
      {
        version: 1,
        blocks: [
          {
            id: 'a',
            type: 'stack',
            className: 'flex',
            hidden: false,
            bindings: { 'props.text': 'title' },
            slots: {
              children: [
                { id: 'b', type: 'heading', props: { text: 'Hi', level: '2', extra: undefined } },
                { id: 'c', type: 'row', slots: { children: [{ id: 'd', type: 'text', props: { text: null } }] } },
              ],
            },
          },
          {
            id: 'k',
            type: 'kitchen',
            props: {
              n: 3,
              flag: true,
              when: '2026-10-03T10:00:00.000Z',
              image: 12,
              link: { relationTo: 'pages', value: 'abc' },
              posts: ['p1', 2],
              content: { root: { type: 'root', children: [] } },
              where: [4.9, 52.4],
              seo: { title: 'SEO' },
              items: [{ id: 'row1', label: 'One' }, { label: 'Two' }],
              meta: { note: 'x' },
              data: { anything: [1, 2] },
            },
          },
        ],
      },
      blocks,
    )
    assert.deepEqual(errors, [])
  })

  it('rejects non-layouts', () => {
    assert.deepEqual(paths(null), [''])
    assert.deepEqual(paths({ version: 2, blocks: 'x' }), ['version', 'blocks'])
  })

  it('reports block structure errors with paths and block ids', () => {
    const errors = validateLayout(
      {
        version: 1,
        blocks: [
          'nope',
          { id: '', type: 'text' },
          { id: 'x', type: 'mystery' },
          { id: 'x', type: 'text' },
          { id: 'y', type: 'stack', children: [], hidden: 'no', bindings: { a: 1 } },
        ],
      },
      blocks,
    )
    assert.deepEqual(
      errors.map((e) => [e.blockId, e.path]),
      [
        [undefined, 'blocks[0]'],
        [undefined, 'blocks[1].id'],
        ['x', 'blocks[2].type'],
        ['x', 'blocks[3].id'],
        ['y', 'blocks[4].children'],
        ['y', 'blocks[4].hidden'],
        ['y', 'blocks[4].bindings.a'],
      ],
    )
    assert.match(errors[3].message, /Duplicate/)
  })

  it('checks slot names and allow rules', () => {
    const errors = validateLayout(
      {
        version: 1,
        blocks: [
          { id: 'a', type: 'heading', props: { text: 'x' }, slots: { children: [] } },
          { id: 'b', type: 'stack', slots: { side: [], children: 'x' } },
          { id: 'c', type: 'row', slots: { children: [{ id: 'd', type: 'heading', props: { text: 'x' } }] } },
        ],
      },
      blocks,
    )
    assert.deepEqual(
      errors.map((e) => e.path),
      ['blocks[0].slots.children', 'blocks[1].slots.side', 'blocks[1].slots.children', 'blocks[2].slots.children[0]'],
    )
    assert.match(errors[3].message, /Heading cannot go inside Row/)
    assert.equal(errors[3].code, 'nesting')
  })

  it('checks required props, unknown props and className', () => {
    assert.deepEqual(
      paths({
        version: 1,
        blocks: [
          { id: 'a', type: 'heading' },
          { id: 'b', type: 'heading', props: { text: '', level: '9', size: 1 }, className: 3 },
          { id: 'c', type: 'text', className: 'p-4' },
        ],
      }),
      ['blocks[0].props.text', 'blocks[1].props.size', 'blocks[1].props.text', 'blocks[1].props.level', 'blocks[1].className', 'blocks[2].className'],
    )
  })

  it('checks prop types by field type', () => {
    const result = paths({
      version: 1,
      blocks: [
        {
          id: 'k',
          type: 'kitchen',
          props: {
            n: 9,
            flag: 'yes',
            when: 'not a date',
            image: { id: 1 },
            link: 'abc',
            posts: 'p1',
            content: 'text',
            where: [1],
            seo: {},
            items: [{ label: 3, other: 1 }],
            meta: { note: 5 },
          },
        },
      ],
    })
    assert.deepEqual(result, [
      'blocks[0].props.n',
      'blocks[0].props.flag',
      'blocks[0].props.when',
      'blocks[0].props.image',
      'blocks[0].props.link',
      'blocks[0].props.posts',
      'blocks[0].props.content',
      'blocks[0].props.where',
      'blocks[0].props.seo.title',
      'blocks[0].props.items[0].other',
      'blocks[0].props.items[0].label',
      'blocks[0].props.meta.note',
    ])
  })

  it('reports nested paths for deep blocks', () => {
    const result = paths({
      version: 1,
      blocks: [{ id: 'a', type: 'stack', slots: { children: [{ id: 'b', type: 'stack', slots: { children: [{ id: 'c', type: 'heading' }] } }] } }],
    })
    assert.deepEqual(result, ['blocks[0].slots.children[0].slots.children[0].props.text'])
  })
})
