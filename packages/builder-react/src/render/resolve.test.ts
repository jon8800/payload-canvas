import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BlockDefinition, Layout } from '@payload-toolkit/builder/core'
import { loadLayoutData, resolveLayoutData, type FetchDocs } from '../index'

const blocks: BlockDefinition[] = [
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
  {
    type: 'image',
    label: 'Image',
    fields: [
      { name: 'image', type: 'upload', relationTo: 'media' },
      { name: 'alt', type: 'text' },
    ],
  },
  {
    type: 'gallery',
    label: 'Gallery',
    fields: [
      { name: 'images', type: 'upload', relationTo: 'media', hasMany: true },
      { name: 'author', type: 'relationship', relationTo: 'users' },
      { name: 'related', type: 'relationship', relationTo: ['posts', 'pages'] },
      { name: 'many', type: 'relationship', relationTo: ['posts', 'pages'], hasMany: true },
      { name: 'meta', type: 'group', fields: [{ name: 'cover', type: 'upload', relationTo: 'media' }] },
      { type: 'row', fields: [{ name: 'rowImage', type: 'upload', relationTo: 'media' }] },
    ],
  },
] as BlockDefinition[]

function makeFetch() {
  const calls: Array<{ collection: string; ids: Array<string | number> }> = []
  const fetchDocs: FetchDocs = async (collection, ids) => {
    calls.push({ collection, ids: [...ids] })
    return new Map(ids.filter((id) => id !== 'missing').map((id) => [id, { id, from: collection }]))
  }
  return { calls, fetchDocs }
}

const layout: Layout = {
  version: 1,
  blocks: [
    { id: 'i1', type: 'image', props: { image: 'm1', alt: 'x' } },
    {
      id: 's',
      type: 'stack',
      slots: {
        children: [
          { id: 'i2', type: 'image', props: { image: 'm2' } },
          { id: 'i3', type: 'image', props: { image: 'm1' } },
          { id: 'i4', type: 'image', props: { image: 'missing' } },
          { id: 'i5', type: 'image', props: { alt: 'no image' } },
          {
            id: 'g',
            type: 'gallery',
            props: {
              images: ['m3', 'm4'],
              author: 'u1',
              related: { relationTo: 'posts', value: 'p1' },
              many: [
                { relationTo: 'pages', value: 'g1' },
                { relationTo: 'posts', value: 'p2' },
              ],
              meta: { cover: 'm5' },
              rowImage: 'm6',
            },
          },
        ],
      },
    },
  ],
}

test('resolveLayoutData fetches once per collection with unique ids', async () => {
  const { calls, fetchDocs } = makeFetch()
  await resolveLayoutData(layout, blocks, fetchDocs)
  assert.equal(calls.length, 4)
  const byCollection = Object.fromEntries(calls.map((c) => [c.collection, c.ids.toSorted()]))
  assert.deepEqual(byCollection, {
    media: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'missing'],
    users: ['u1'],
    posts: ['p1', 'p2'],
    pages: ['g1'],
  })
})

test('resolveLayoutData replaces ids, handles hasMany, polymorphic and groups', async () => {
  const { fetchDocs } = makeFetch()
  const out = await resolveLayoutData(layout, blocks, fetchDocs)
  const children = out.blocks[1]!.slots!.children!
  assert.deepEqual(out.blocks[0]!.props, { image: { id: 'm1', from: 'media' }, alt: 'x' })
  assert.deepEqual(children[0]!.props, { image: { id: 'm2', from: 'media' } })
  assert.deepEqual(children[2]!.props, { image: 'missing' })
  assert.deepEqual(children[3]!.props, { alt: 'no image' })
  assert.deepEqual(children[4]!.props, {
    images: [
      { id: 'm3', from: 'media' },
      { id: 'm4', from: 'media' },
    ],
    author: { id: 'u1', from: 'users' },
    related: { relationTo: 'posts', value: { id: 'p1', from: 'posts' } },
    many: [
      { relationTo: 'pages', value: { id: 'g1', from: 'pages' } },
      { relationTo: 'posts', value: { id: 'p2', from: 'posts' } },
    ],
    meta: { cover: { id: 'm5', from: 'media' } },
    rowImage: { id: 'm6', from: 'media' },
  })
})

test('resolveLayoutData does not mutate its input', async () => {
  const { fetchDocs } = makeFetch()
  const before = structuredClone(layout)
  const out = await resolveLayoutData(layout, blocks, fetchDocs)
  assert.deepEqual(layout, before)
  assert.notEqual(out, layout)
  assert.notEqual(out.blocks[0], layout.blocks[0])
})

test('resolveLayoutData skips fetching when there is nothing to load', async () => {
  const { calls, fetchDocs } = makeFetch()
  const plain: Layout = { version: 1, blocks: [{ id: 'a', type: 'image', props: { alt: 'x' } }] }
  const out = await resolveLayoutData(plain, blocks, fetchDocs)
  assert.equal(calls.length, 0)
  assert.deepEqual(out, plain)
})

test('resolveLayoutData leaves already loaded docs alone', async () => {
  const { calls, fetchDocs } = makeFetch()
  const doc = { id: 'm1', url: '/a.jpg' }
  const loaded: Layout = { version: 1, blocks: [{ id: 'a', type: 'image', props: { image: doc } }] }
  const out = await resolveLayoutData(loaded, blocks, fetchDocs)
  assert.equal(calls.length, 0)
  assert.equal(out.blocks[0]!.props!.image, doc)
})

test('resolveLayoutData matches numeric ids returned for string ids', async () => {
  const numeric: Layout = { version: 1, blocks: [{ id: 'a', type: 'image', props: { image: '5' } }] }
  const out = await resolveLayoutData(numeric, blocks, async () => new Map([[5, { id: 5 }]]))
  assert.deepEqual(out.blocks[0]!.props!.image, { id: 5 })
})

test('loadLayoutData calls payload.find once per collection', async () => {
  const calls: Array<Record<string, unknown>> = []
  const payload = {
    find: async (args: Record<string, unknown>) => {
      calls.push(args)
      const ids = (args.where as { id: { in: string[] } }).id.in
      return { docs: ids.map((id) => ({ id, collection: args.collection })) }
    },
  }
  const small: Layout = {
    version: 1,
    blocks: [
      { id: 'a', type: 'image', props: { image: 'm1' } },
      { id: 'b', type: 'image', props: { image: 'm2' } },
    ],
  }
  const out = await loadLayoutData(small, blocks, payload as never, { draft: true })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    collection: 'media',
    where: { id: { in: ['m1', 'm2'] } },
    depth: 0,
    draft: true,
    limit: 2,
    pagination: false,
    joins: false,
  })
  assert.deepEqual(out.blocks[1]!.props, { image: { id: 'm2', collection: 'media' } })
})

test('resolveLayoutData walks link groups, arrays, blocks fields and rich text', async () => {
  const defs = [
    {
      type: 'button',
      label: 'Button',
      fields: [
        {
          name: 'link',
          type: 'group',
          fields: [
            { name: 'type', type: 'select', options: ['url', 'reference'] },
            { name: 'reference', type: 'relationship', relationTo: ['pages', 'posts'] },
          ],
        },
      ],
    },
    {
      type: 'cards',
      label: 'Cards',
      fields: [
        {
          name: 'rows',
          type: 'array',
          fields: [
            { name: 'image', type: 'upload', relationTo: 'media' },
            { name: 'nested', type: 'array', fields: [{ name: 'author', type: 'relationship', relationTo: 'users' }] },
          ],
        },
        {
          name: 'sections',
          type: 'blocks',
          blocks: [{ slug: 'hero', fields: [{ name: 'bg', type: 'upload', relationTo: 'media' }] }],
        },
        { name: 'body', type: 'richText' },
      ],
    },
  ] as BlockDefinition[]
  const body = {
    root: {
      type: 'root',
      children: [
        { type: 'upload', relationTo: 'media', value: 'm9', fields: null },
        {
          type: 'paragraph',
          children: [
            { type: 'link', fields: { linkType: 'internal', doc: { relationTo: 'pages', value: 'g2' } }, children: [] },
            { type: 'link', fields: { linkType: 'custom', url: '/x' }, children: [] },
            { type: 'text', text: 'plain' },
          ],
        },
        { type: 'relationship', relationTo: 'posts', value: { id: 'p1', loaded: true } },
      ],
    },
  }
  const input: Layout = {
    version: 1,
    blocks: [
      { id: 'b', type: 'button', props: { link: { type: 'reference', reference: { relationTo: 'pages', value: 'g1' } } } },
      {
        id: 'c',
        type: 'cards',
        props: {
          rows: [{ id: 'r1', image: 'm1', nested: [{ author: 'u1' }] }, { id: 'r2' }],
          sections: [{ blockType: 'hero', bg: 'm2' }, { blockType: 'unknown', bg: 'm3' }],
          body,
        },
      },
    ],
  }
  const { calls, fetchDocs } = makeFetch()
  const before = structuredClone(input)
  const out = await resolveLayoutData(input, defs, fetchDocs)
  assert.deepEqual(input, before)
  const byCollection = Object.fromEntries(calls.map((c) => [c.collection, c.ids.toSorted()]))
  assert.deepEqual(byCollection, { pages: ['g1', 'g2'], media: ['m1', 'm2', 'm9'], users: ['u1'] })

  assert.deepEqual(out.blocks[0]!.props!.link, {
    type: 'reference',
    reference: { relationTo: 'pages', value: { id: 'g1', from: 'pages' } },
  })
  const props = out.blocks[1]!.props!
  assert.deepEqual(props.rows, [
    { id: 'r1', image: { id: 'm1', from: 'media' }, nested: [{ author: { id: 'u1', from: 'users' } }] },
    { id: 'r2' },
  ])
  assert.deepEqual(props.sections, [{ blockType: 'hero', bg: { id: 'm2', from: 'media' } }, { blockType: 'unknown', bg: 'm3' }])
  const root = (props.body as typeof body).root
  assert.deepEqual(root.children[0], { type: 'upload', relationTo: 'media', value: { id: 'm9', from: 'media' }, fields: null })
  const links = (root.children[1] as { children: Array<{ fields: unknown }> }).children
  assert.deepEqual(links[0]!.fields, { linkType: 'internal', doc: { relationTo: 'pages', value: { id: 'g2', from: 'pages' } } })
  // Unchanged nodes keep their identity.
  assert.equal(links[1], body.root.children[1]!.children![1])
  assert.equal(root.children[2], body.root.children[2])
})
