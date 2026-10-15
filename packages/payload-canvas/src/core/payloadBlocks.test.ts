import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fromPayloadBlocks } from '../blocks/payload'
import { decodePayloadBlocks, encodePayloadBlocks, payloadBlocksProblems, payloadBlocksStorage, withUniqueRowIds } from './payloadBlocks'
import type { Layout } from './types'

const blocks = fromPayloadBlocks(
  [
    {
      slug: 'section',
      fields: [
        { name: 'tone', type: 'text' },
        { name: 'content', type: 'blocks', blocks: [{ slug: 'card', fields: [{ name: 'title', type: 'text' }] }] },
      ],
    },
    {
      slug: 'list',
      fields: [
        { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text' }, { name: 'doc', type: 'relationship', relationTo: 'docs' }] },
        // A blocks field inside a group: kept as data, not a slot.
        { name: 'extra', type: 'group', fields: [{ name: 'inner', type: 'blocks', blocks: [{ slug: 'card', fields: [] }] }] },
      ],
    },
  ] as never,
  { onWarning: false },
)
const storage = payloadBlocksStorage(['section', 'list'], blocks, '"pages.layout"')

/** Stored rows with every kind of value the codec must keep. */
const stored = [
  {
    id: 'a1',
    blockType: 'section',
    blockName: ' Intro ',
    tone: null,
    unknownKey: { kept: true },
    content: [
      { id: 'c1', blockType: 'card', title: 'One' },
      { id: 'c2', blockType: 'card', title: '' },
    ],
  },
  {
    id: 'b1',
    blockType: 'list',
    items: [
      { id: 'r1', label: 'First', doc: 7 },
      { id: 'r2', label: null, doc: null },
    ],
    extra: { inner: [{ id: 'i1', blockType: 'card' }] },
  },
  { id: 'a2', blockType: 'section', content: [] },
]

describe('Payload blocks codec', () => {
  it('reads stored rows into blocks and slots, keeping every value', () => {
    const result = decodePayloadBlocks(stored, storage)
    assert.ok(result.ok)
    const [intro, list, empty] = result.layout.blocks
    assert.deepEqual(intro, {
      id: 'a1',
      type: 'section',
      label: ' Intro ',
      props: { tone: null, unknownKey: { kept: true } },
      slots: {
        content: [
          { id: 'c1', type: 'card', props: { title: 'One' } },
          { id: 'c2', type: 'card', props: { title: '' } },
        ],
      },
    })
    assert.deepEqual(list.props, { items: stored[1].items, extra: stored[1].extra })
    assert.equal(list.slots, undefined)
    assert.deepEqual(empty, { id: 'a2', type: 'section' })
  })

  it('writes the same rows back (a round trip changes nothing)', () => {
    const result = decodePayloadBlocks(stored, storage)
    assert.ok(result.ok)
    assert.deepEqual(encodePayloadBlocks(result.layout, storage), stored)
  })

  it('reads an empty field as an empty layout, and gives rows without an id one', () => {
    for (const value of [null, undefined, []]) {
      assert.deepEqual(decodePayloadBlocks(value, storage), { ok: true, layout: { version: 1, blocks: [] } })
    }
    const result = decodePayloadBlocks([{ blockType: 'section' }], storage)
    assert.ok(result.ok)
    assert.ok(result.layout.blocks[0].id.length > 0)
  })

  it('refuses data it cannot keep exactly, with the reason', () => {
    const cases: [unknown, RegExp][] = [
      [{ not: 'a list' }, /not hold a list/],
      [[{ id: 'x', blockType: 'gallery' }], /"gallery" block, which the builder has no definition/],
      [[{ id: 'x' }], /no block type/],
      [
        [
          { id: 'x', blockType: 'section' },
          { id: 'x', blockType: 'list' },
        ],
        /Two blocks have the id "x"/,
      ],
    ]
    for (const [value, message] of cases) {
      const result = decodePayloadBlocks(value, storage)
      assert.equal(result.ok, false)
      assert.match((result as { error: string }).error, message)
    }
  })

  it('names what the field cannot store: builder data, unknown and misplaced blocks', () => {
    const layout: Layout = {
      version: 1,
      blocks: [
        { id: '1', type: 'section', className: 'p-4', motion: { preset: 'fade' } as never, hidden: true },
        { id: '2', type: 'card' },
        { id: '3', type: 'heading' },
        { id: '4', type: 'list', slots: { content: [] } },
        { id: '5', type: 'section', slots: { content: [{ id: '6', type: 'list' }] }, locales: { fr: {} } as never },
      ],
    }
    const problems = payloadBlocksProblems(layout, storage)
    for (const text of [
      'cannot store Tailwind classes',
      'cannot store animations',
      'cannot store hidden blocks',
      'Card blocks are not allowed here.',
      '"heading" blocks cannot be stored in this field.',
      'has no "content" slot',
      'List blocks are not allowed here.',
      "translations are edited in Payload's editor",
    ]) {
      assert.ok(
        problems.some((p) => p.includes(text)),
        `${text}: ${problems.join(' | ')}`,
      )
    }
    const fine = decodePayloadBlocks(stored, storage)
    assert.ok(fine.ok)
    assert.deepEqual(payloadBlocksProblems(fine.layout, storage), [])
  })

  it('finds the definitions of every block type at every depth, and names missing ones', () => {
    assert.deepEqual(storage.rootTypes, ['section', 'list'])
    assert.deepEqual(storage.blocks.map((b) => b.type).toSorted(), ['card', 'list', 'section'])
    assert.throws(() => payloadBlocksStorage(['section', 'gallery'], blocks, '"pages.layout"'), /no definition for its block "gallery"/)
  })
})

describe('Payload blocks codec: row ids of copies and cleared values', () => {
  const withJson = payloadBlocksStorage(
    ['list'],
    fromPayloadBlocks(
      [
        {
          slug: 'list',
          fields: [
            { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text' }] },
            { name: 'raw', type: 'json' },
            { name: 'extra', type: 'group', fields: [{ name: 'inner', type: 'blocks', blocks: [{ slug: 'card', fields: [{ name: 'title', type: 'text' }] }] }] },
          ],
        },
      ] as never,
      { onWarning: false },
    ),
    '"pages.layout"',
  )
  const original = {
    id: 'a',
    type: 'list',
    props: { items: [{ id: 'r1', label: 'One' }], raw: [{ id: 'r1', keep: true }], extra: { inner: [{ id: 'i1', blockType: 'card', title: 'x' }] } },
  }
  const layout: Layout = { version: 1, blocks: [original] }

  it('renews only colliding row ids of inserted blocks, through arrays and nested blocks, never inside json', () => {
    const ops = withUniqueRowIds(layout, [{ type: 'insert', block: { ...original, id: 'b' }, to: { parentId: null, index: 1 } }], withJson)
    const block = (ops[0] as { block: { props: Record<string, unknown> } }).block
    const items = block.props.items as { id: string; label: string }[]
    assert.notEqual(items[0].id, 'r1')
    assert.equal(items[0].label, 'One')
    const inner = (block.props.extra as { inner: { id: string }[] }).inner
    assert.notEqual(inner[0].id, 'i1')
    assert.deepEqual(block.props.raw, [{ id: 'r1', keep: true }], 'a json value stays as it is')
    const unique = [{ type: 'insert' as const, block: { id: 'c', type: 'list', props: { items: [{ id: 'new', label: 'x' }] } }, to: { parentId: null, index: 1 } }]
    assert.equal(withUniqueRowIds(layout, unique, withJson), unique, 'nothing to change: the same operations')
  })

  it('writes null for what the layout removed when the stored row had it, and nothing else', () => {
    const storedRows = encodePayloadBlocks(layout, withJson)
    const cleared: Layout = {
      version: 1,
      blocks: [{ id: 'a', type: 'list', props: { items: [{ id: 'r1' }], extra: { inner: [{ id: 'i1', blockType: 'card' }] } } }],
    }
    const [row] = encodePayloadBlocks(cleared, withJson, [{ ...storedRows[0], blockName: 'Named' }])
    assert.equal(row.blockName, null)
    assert.equal(row.raw, null)
    assert.deepEqual(row.items, [{ id: 'r1', label: null }])
    assert.deepEqual((row.extra as { inner: unknown[] }).inner, [{ id: 'i1', blockType: 'card', title: null }])
    // Without the stored value, or for keys it does not have: no nulls.
    assert.equal('raw' in encodePayloadBlocks(cleared, withJson)[0], false)
  })
})
