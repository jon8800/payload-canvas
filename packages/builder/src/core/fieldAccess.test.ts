import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { accessPath, propAccessAt, propAccessInfo, propAccessRuleOf, type PropAccessRule } from './fieldAccess'
import { captureFieldSemantics } from './fieldSemantics'
import type { Block, BlockDefinition, Layout } from './types'

type Args = { req: { user?: { email?: string } | null }; siblingData?: Record<string, unknown> }
const isAdmin = ({ req }: Args) => req.user?.email === 'admin@x.test'

const blocks: BlockDefinition[] = [
  {
    type: 'product',
    label: 'Product',
    fields: [
      { name: 'title', type: 'text', access: { update: ({ req, siblingData }: Args) => isAdmin({ req }) || siblingData?.locked !== true } },
      { name: 'locked', type: 'checkbox' },
      { name: 'note', type: 'text', access: { read: isAdmin } },
      { name: 'price', type: 'number', access: { update: isAdmin } },
      { name: 'items', type: 'array', fields: [{ name: 'label', type: 'text', access: { update: isAdmin } }] },
      { name: 'broken', type: 'text', access: { read: () => { throw new Error('boom') } } },
    ] as unknown as Field[],
  },
  { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] as unknown as Field[] },
]
const registry = captureFieldSemantics(blocks)
const layout = (...list: Block[]): Layout => ({ version: 1, blocks: list })
const ctx = (email: string) => ({ layoutField: 'layout', req: { user: { email } }, operation: 'update' as const, id: 'p1', overrideAccess: false })

describe('accessPath and propAccessAt', () => {
  it('drops row indexes', () => {
    assert.equal(accessPath('items.1.label'), 'items.label')
    assert.equal(accessPath('title'), 'title')
  })

  it('locks and hides by path, also inside a hidden group', () => {
    const rule: PropAccessRule = { read: ['meta'], update: ['price', 'items.label'] }
    assert.deepEqual(propAccessAt(rule, 'price'), { read: true, update: false })
    assert.deepEqual(propAccessAt(rule, 'items.3.label'), { read: true, update: false })
    assert.deepEqual(propAccessAt(rule, 'meta.secret'), { read: false, update: false })
    assert.deepEqual(propAccessAt(rule, 'title'), { read: true, update: true })
    assert.deepEqual(propAccessAt(undefined, 'price'), { read: true, update: true })
  })
})

describe('propAccessInfo', () => {
  const page = layout(
    { id: 'a', type: 'product', props: { title: 'Open' } },
    { id: 'b', type: 'product', props: { title: 'Fixed', locked: true, items: [{ id: 'r', label: 'x' }] } },
    { id: 'h', type: 'heading', props: { text: 'Hi' } },
  )

  it('is null without read or update access on any block field', async () => {
    const plain = blocks.slice(1)
    assert.equal(await propAccessInfo(page, { blocks: plain, registry: captureFieldSemantics(plain), ctx: ctx('editor@x.test') }), null)
  })

  it('gives a rule per type and per block whose data changes the answer', async () => {
    const info = await propAccessInfo(page, { blocks, registry, ctx: ctx('editor@x.test') })
    assert.ok(info)
    // A function that throws counts as "no".
    assert.deepEqual(info.types.product, { read: ['broken', 'note'], update: ['items.label', 'price'] })
    assert.equal(info.types.heading, undefined)
    // Block "a" answers like a new block; block "b" is locked, so its title is read-only.
    assert.deepEqual(Object.keys(info.blocks), ['b'])
    assert.deepEqual(info.blocks.b?.update, ['items.label', 'price', 'title'])
    assert.deepEqual(propAccessAt(propAccessRuleOf(info, 'b', 'product'), 'title'), { read: true, update: false })
    assert.deepEqual(propAccessAt(propAccessRuleOf(info, 'a', 'product'), 'title'), { read: true, update: true })
    // A block the server has not seen yet uses its type's rule.
    assert.deepEqual(propAccessAt(propAccessRuleOf(info, 'new', 'product'), 'note'), { read: false, update: false })
  })

  it('lets the admin read and change everything except what throws', async () => {
    const info = await propAccessInfo(page, { blocks, registry, ctx: ctx('admin@x.test') })
    assert.deepEqual(info?.types.product, { read: ['broken'] })
    assert.deepEqual(info?.blocks, {})
  })

  it('skips blocks the cache knows', async () => {
    const seen: string[] = []
    const cache = {
      get: (block: Block) => (block.id === 'b' ? { update: ['title'] } : undefined),
      set: (block: Block) => {
        seen.push(block.id)
      },
    }
    const info = await propAccessInfo(page, { blocks, registry, ctx: ctx('editor@x.test'), cache })
    assert.deepEqual(seen, ['a'])
    assert.deepEqual(info?.blocks.b, { update: ['title'] })
  })
})
