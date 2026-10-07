import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { Field } from 'payload'

import { deniedPropChanges, denialMessage, enforcePropAccess, filterUnreadableProps } from './fieldAccess'
import { runPropHooks, type FieldRunContext } from './fieldHooks'
import { captureFieldSemantics, sameJson, walkPropFields, type PropFieldVisit } from './fieldSemantics'
import { propPathOf, runPropValidators } from './fieldValidate'
import { findBlock } from './tree'
import type { BlockDefinition, Layout } from './types'
import { isBlockingError, validateLayout } from './validate'

type Args = Record<string, unknown>
const slugify = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : value

/** Collects every call of a field function, with its arguments. */
function recorder<T>(result: (args: Args, value?: unknown) => T) {
  const calls: Args[] = []
  const fn = (a: unknown, b?: unknown) => {
    // Hooks and access get one object; validate gets (value, options).
    const args = (b === undefined ? a : { ...(b as Args), __value: a }) as Args
    calls.push(args)
    return result(args, a)
  }
  return { fn, calls }
}

const req = { user: { id: 1, email: 'admin@x.test' }, t: (key: string) => key, payload: {} }
const ctx = (extra: Partial<FieldRunContext> = {}): FieldRunContext => ({
  layoutField: 'layout',
  req,
  collection: { slug: 'pages' },
  context: {},
  operation: 'update',
  id: 'p1',
  data: { title: 'Home' },
  overrideAccess: false,
  ...extra,
})

function productBlocks() {
  const skuValidate = recorder((args) =>
    args.__value === undefined || (typeof args.__value === 'string' && /^[A-Z]{3}-\d{3}$/.test(args.__value)) ? true : 'Use a SKU like ABC-123',
  )
  const slugHook = recorder((args) => slugify(args.value))
  const readHook = recorder((args) => (typeof args.value === 'string' ? args.value.toUpperCase() : args.value))
  const labelHook = recorder((args) => (typeof args.value === 'string' ? args.value.trim() : undefined))
  const noteRead = recorder((args) => (args.req as typeof req).user?.email === 'admin@x.test')
  const priceUpdate = recorder((args) => (args.req as typeof req).user?.email === 'admin@x.test')
  const fields = [
    { name: 'sku', type: 'text', validate: skuValidate.fn },
    { name: 'slug', type: 'text', hooks: { beforeChange: [slugHook.fn] } },
    { name: 'shout', type: 'text', hooks: { afterRead: [readHook.fn] } },
    { name: 'note', type: 'text', access: { read: noteRead.fn } },
    { name: 'price', type: 'number', defaultValue: 10, access: { update: priceUpdate.fn } },
    { name: 'kind', type: 'select', options: ['a', 'b'] },
    {
      name: 'extra',
      type: 'text',
      validate: () => 'never shown while hidden',
      admin: { custom: { builderCondition: { field: 'kind', equals: 'b' } } },
    },
    {
      type: 'row',
      fields: [{ name: 'seo', type: 'group', fields: [{ name: 'title', type: 'text', validate: (v: unknown) => (v === 'bad' ? 'Bad title' : true) }] }],
    },
    {
      type: 'tabs',
      tabs: [{ name: 'meta', fields: [{ name: 'code', type: 'text', hooks: { beforeChange: [slugHook.fn] } }] }, { label: 'More', fields: [{ name: 'flat', type: 'text', validate: (v: unknown) => (v === 'x' ? 'No x' : true) }] }],
    },
    {
      name: 'items',
      type: 'array',
      fields: [{ name: 'label', type: 'text', hooks: { beforeValidate: [labelHook.fn] }, validate: (v: unknown) => (v === '' ? 'Empty label' : true) }],
    },
    {
      name: 'cards',
      type: 'blocks',
      blocks: [{ slug: 'card', fields: [{ name: 'heading', type: 'text', validate: (v: unknown, o: Args) => (v === 'no' ? `No in ${String((o.blockData as Args).blockType)}` : true) }] }],
    },
  ] as unknown as Field[]
  const blocks: BlockDefinition[] = [
    { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
    { type: 'product', label: 'Product', fields, payload: { slug: 'productBlock' } },
  ]
  return { blocks, skuValidate, slugHook, readHook, labelHook, noteRead, priceUpdate }
}

const page = (props: Record<string, unknown>, extra: Partial<Layout['blocks'][number]> = {}): Layout => ({
  version: 1,
  blocks: [{ id: 's', type: 'stack', slots: { children: [{ id: 'p', type: 'product', props, ...extra }] } }],
})

describe('captureFieldSemantics', () => {
  it('reads validate, hooks and access at every depth, and the block types that have them', () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    assert.deepEqual([...registry.types('validate')], ['product'])
    assert.deepEqual([...registry.types('beforeChange')], ['product'])
    assert.deepEqual([...registry.types('beforeValidate')], ['product'])
    assert.deepEqual([...registry.types('afterRead')], ['product'])
    assert.deepEqual([...registry.types('read')], ['product'])
    assert.deepEqual([...registry.types('update')], ['product'])
    assert.equal(registry.types('afterChange').size, 0)
  })

  it('ignores what Payload adds later while it sanitizes the same field objects', () => {
    const field = { name: 'title', type: 'text' } as Record<string, unknown>
    const hooked = { name: 'body', type: 'richText', hooks: { afterRead: [() => 'mine'] } } as Record<string, unknown>
    const registry = captureFieldSemantics([{ type: 'x', label: 'X', fields: [field, hooked] as unknown as Field[] }])
    // What Payload's sanitizeFields does to the objects afterwards:
    field.validate = () => 'Payload default'
    field.hooks = { beforeChange: [() => 'editor hook'] }
    ;(hooked.hooks as Record<string, unknown[]>).afterRead.push(() => 'editor hook')
    assert.equal(registry.of(field), undefined)
    assert.equal(registry.of(hooked)?.hooks.afterRead?.length, 1)
    assert.equal(registry.types('validate').size, 0)
  })
})

describe('walkPropFields', () => {
  it('visits nested fields with Payload paths, rows by id, and block data', async () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({
      seo: { title: 't' },
      meta: { code: 'c' },
      flat: 'f',
      items: [{ id: 'r1', label: 'one' }, { id: 'r2', label: 'two' }],
      cards: [{ id: 'c1', blockType: 'card', heading: 'h' }],
    })
    const previous = page({ items: [{ id: 'r2', label: 'old two' }] })
    const seen: PropFieldVisit[] = []
    await walkPropFields(layout, { blocks, registry, previous, visit: (v) => void seen.push(v) })
    const byPath = new Map(seen.map((v) => [v.propPath, v]))
    assert.ok(['sku', 'seo', 'seo.title', 'meta', 'meta.code', 'flat', 'items.0.label', 'items.1.label', 'cards.0.heading'].every((p) => byPath.has(p)))
    const label = byPath.get('items.1.label')!
    assert.deepEqual(label.path, ['blocks', 0, 'slots', 'children', 0, 'props', 'items', 1, 'label'])
    assert.equal(label.errorPath, 'blocks[0].slots.children[0].props.items[1].label')
    assert.deepEqual(label.schemaPath, ['product', 'items', 'label'])
    assert.equal(label.previousSiblingDoc?.label, 'old two', 'rows match by id')
    assert.equal(byPath.get('items.0.label')!.previousSiblingDoc, undefined)
    assert.equal(byPath.get('cards.0.heading')!.blockData.blockType, 'card')
    assert.equal(byPath.get('sku')!.blockData.blockType, 'productBlock', 'the Payload slug of a fromPayloadBlocks block')
    assert.equal(byPath.get('sku')!.top, true)
    assert.equal(byPath.get('seo.title')!.top, false)
    assert.equal(byPath.get('extra')!.hidden, true)
  })
})

describe('runPropHooks', () => {
  it('runs beforeChange with Payload arguments and stores what the hook returns', async () => {
    const { blocks, slugHook } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({ slug: 'Hello World!', meta: { code: 'A B' } })
    const previous = page({ slug: 'old' })
    const changed = await runPropHooks('beforeChange', layout, { blocks, registry, previous, ctx: ctx() })
    assert.equal(changed, true)
    const props = findBlock(layout, 'p')?.props
    assert.equal(props?.slug, 'hello-world')
    assert.deepEqual(props?.meta, { code: 'a-b' })
    const call = slugHook.calls.find((c) => c.value === 'Hello World!')!
    assert.equal(call.previousValue, 'old')
    assert.deepEqual(call.previousSiblingDoc, { slug: 'old' })
    assert.deepEqual(call.path, ['layout', 'blocks', 0, 'slots', 'children', 0, 'props', 'slug'])
    assert.deepEqual(call.schemaPath, ['layout', 'product', 'slug'])
    assert.equal(call.operation, 'update')
    assert.equal(call.req, req)
    assert.equal((call.field as Args).name, 'slug')
    assert.equal(call.global, null)
    assert.deepEqual(call.data, { title: 'Home' })
    // siblingData is the live props object, as in Payload: it holds the hook's result now.
    assert.equal((call.siblingData as Args).slug, 'hello-world')
    assert.equal(call.findMany, undefined, 'afterRead-only arguments stay out')
  })

  it('keeps the value when a hook returns undefined, and runs array row hooks', async () => {
    const { blocks, labelHook } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({ items: [{ id: 'r1', label: '  padded  ' }, { id: 'r2' }] })
    await runPropHooks('beforeValidate', layout, { blocks, registry, ctx: ctx() })
    assert.deepEqual(findBlock(layout, 'p')?.props?.items, [{ id: 'r1', label: 'padded' }, { id: 'r2' }])
    assert.equal(labelHook.calls.length, 2)
  })

  it('reports no change and does not walk when no block has the hook', async () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({ slug: 'x' })
    assert.equal(await runPropHooks('afterChange', layout, { blocks, registry, ctx: ctx() }), false)
  })

  it('gives afterRead its own arguments', async () => {
    const { blocks, readHook } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({ shout: 'hey' })
    await runPropHooks('afterRead', layout, { blocks, registry, ctx: ctx({ operation: 'read', findMany: true, depth: 1 }) })
    assert.equal(findBlock(layout, 'p')?.props?.shout, 'HEY')
    assert.equal(readHook.calls[0].findMany, true)
    assert.equal(readHook.calls[0].depth, 1)
  })

  it('gives a block without props its first value', async () => {
    const blocks: BlockDefinition[] = [{ type: 'x', label: 'X', fields: [{ name: 'a', type: 'text', hooks: { beforeChange: [fillHook] } }] as Field[] }]
    const layout: Layout = { version: 1, blocks: [{ id: 'x1', type: 'x' }] }
    await runPropHooks('beforeChange', layout, { blocks, registry: captureFieldSemantics(blocks), ctx: ctx() })
    assert.deepEqual(layout.blocks[0].props, { a: 'filled' })
  })
})

describe('runPropValidators', () => {
  it('returns publish-only errors with block ids and paths, and passes Payload validate options', async () => {
    const { blocks, skuValidate } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({
      sku: 'abc',
      seo: { title: 'bad' },
      flat: 'x',
      items: [{ id: 'r1', label: '' }],
      cards: [{ id: 'c1', blockType: 'card', heading: 'no' }],
    })
    const errors = await runPropValidators(layout, { blocks, registry, previous: page({ sku: 'OLD-111' }), ctx: ctx({ data: { title: 'Home', layout } }) })
    assert.deepEqual(
      errors.map((e) => [e.blockId, e.path, e.message, e.code]),
      [
        ['p', 'blocks[0].slots.children[0].props.sku', 'Use a SKU like ABC-123', 'validate'],
        ['p', 'blocks[0].slots.children[0].props.seo.title', 'Bad title', 'validate'],
        ['p', 'blocks[0].slots.children[0].props.flat', 'No x', 'validate'],
        ['p', 'blocks[0].slots.children[0].props.items[0].label', 'Empty label', 'validate'],
        ['p', 'blocks[0].slots.children[0].props.cards[0].heading', 'No in card', 'validate'],
      ],
    )
    assert.ok(errors.every((e) => isBlockingError(e, true) && !isBlockingError(e, false)), 'publish only')
    const options = skuValidate.calls[0]
    assert.equal(options.__value, 'abc')
    assert.equal(options.event, 'submit')
    assert.equal(options.collectionSlug, 'pages')
    assert.equal(options.id, 'p1')
    assert.equal(options.previousValue, 'OLD-111')
    assert.deepEqual(options.preferences, { fields: {} })
    assert.equal(options.name, 'sku', 'the field config is spread in, as Payload does')
    assert.equal((options.siblingData as Args).sku, 'abc')
    assert.equal((options.data as Args).title, 'Home')
    assert.deepEqual(options.path, ['layout', 'blocks', 0, 'slots', 'children', 0, 'props', 'sku'])
  })

  it('skips hidden fields, bound props, other blocks, and runs nothing without req', async () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const hidden = page({ kind: 'a', extra: 'anything' })
    assert.deepEqual(await runPropValidators(hidden, { blocks, registry, ctx: ctx() }), [])
    const shown = page({ kind: 'b', extra: 'anything' })
    assert.equal((await runPropValidators(shown, { blocks, registry, ctx: ctx() }))[0]?.message, 'never shown while hidden')
    const bound = page({ sku: 'bad' }, { bindings: { sku: 'title' } })
    assert.deepEqual(await runPropValidators(bound, { blocks, registry, ctx: ctx() }), [])
    assert.deepEqual(await runPropValidators(page({ sku: 'bad' }), { blocks, registry, ctx: ctx(), only: new Set(['other']) }), [])
    assert.deepEqual(await runPropValidators(page({ sku: 'bad' }), { blocks, registry, ctx: ctx({ req: undefined }) }), [])
  })

  it('reports a validator that throws, and calls admin.condition functions with Payload arguments', async () => {
    const seen: unknown[] = []
    const blocks: BlockDefinition[] = [
      {
        type: 'x',
        label: 'X',
        fields: [
          { name: 'a', type: 'text', validate: () => { throw new Error('Lookup failed') } },
          {
            name: 'b',
            type: 'text',
            validate: () => 'b is wrong',
            admin: { condition: (data: Args, sibling: Args, extra: Args) => (seen.push([data.title, sibling.a, (extra.user as Args).id]), sibling.a === 'show') },
          },
        ] as unknown as Field[],
      },
    ]
    const registry = captureFieldSemantics(blocks)
    const layout: Layout = { version: 1, blocks: [{ id: 'x1', type: 'x', props: { a: 'hide', b: 'v' } }] }
    const errors = await runPropValidators(layout, { blocks, registry, ctx: ctx() })
    assert.deepEqual(errors.map((e) => e.message), ['Lookup failed'])
    assert.deepEqual(seen, [['Home', 'hide', 1]])
  })

  it('turns error paths into inspector paths', () => {
    assert.equal(propPathOf('blocks[0].slots.children[1].props.items[2].label'), 'items.2.label')
    assert.equal(propPathOf('blocks[0].id'), null)
  })
})

const fillHook = () => 'filled'
const denyCreate = () => false
const user = (email: string) => ({ ...req, user: { id: 2, email } })

describe('field access', () => {

  it('refuses changes to a prop the user may not update, and allows copies and defaults in new blocks', async () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const before = page({ price: 20, sku: 'ABC-123' })
    const editor = { blocks, registry, before, ctx: ctx({ req: user('editor@x.test') }) }

    const changed = page({ price: 25, sku: 'ABC-123' })
    const denials = await deniedPropChanges(changed, editor)
    assert.deepEqual(denials.map((d) => [d.blockId, d.propPath, d.label]), [['p', 'price', 'Price']])
    assert.equal(denialMessage(denials, () => 'Product'), 'You cannot change Price (Product). Nothing was applied.')

    // Other props of the block stay editable.
    assert.deepEqual(await deniedPropChanges(page({ price: 20, sku: 'XYZ-999' }), editor), [])
    // The admin may change it.
    assert.deepEqual(await deniedPropChanges(changed, { ...editor, ctx: ctx() }), [])

    // A new block: empty, the default value, or a copy of a value on the page is fine.
    const withNew = (price: unknown): Layout => {
      const next = structuredClone(before)
      next.blocks.push({ id: 'n', type: 'product', props: price === undefined ? {} : { price } })
      return next
    }
    assert.deepEqual(await deniedPropChanges(withNew(undefined), editor), [])
    assert.deepEqual(await deniedPropChanges(withNew(10), editor), [])
    assert.deepEqual(await deniedPropChanges(withNew(20), editor), [])
    assert.equal((await deniedPropChanges(withNew(99), editor)).length, 1)
    // Removing a block is not a prop change.
    assert.deepEqual(await deniedPropChanges({ version: 1, blocks: [] }, editor), [])
  })

  it('uses create access for a new document', async () => {
    const blocks: BlockDefinition[] = [{ type: 'x', label: 'X', fields: [{ name: 'a', type: 'text', access: { create: denyCreate } }] as unknown as Field[] }]
    const registry = captureFieldSemantics(blocks)
    const layout: Layout = { version: 1, blocks: [{ id: 'x1', type: 'x', props: { a: 'set' } }] }
    assert.equal((await deniedPropChanges(layout, { blocks, registry, before: null, ctx: ctx({ operation: 'create' }) })).length, 1)
    assert.equal((await deniedPropChanges(layout, { blocks, registry, before: null, ctx: ctx() })).length, 0, 'update access is not set')
  })

  it('puts refused values back, and restores props the user could not read', async () => {
    const { blocks } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const before = page({ price: 20, note: 'secret', sku: 'ABC-123' })
    // What a REST client without read access to `note` sends back after changing price and sku.
    const after = page({ price: 1, sku: 'NEW-000' })
    const denials = await enforcePropAccess(after, { blocks, registry, before, ctx: ctx({ req: user('editor@x.test') }) })
    assert.equal(denials.length, 1)
    assert.deepEqual(findBlock(after, 'p')?.props, { price: 20, sku: 'NEW-000', note: 'secret' })
  })

  it('removes props the user may not read from API output', async () => {
    const { blocks, noteRead } = productBlocks()
    const registry = captureFieldSemantics(blocks)
    const layout = page({ note: 'secret', sku: 'ABC-123' })
    assert.equal(await filterUnreadableProps(layout, { blocks, registry, ctx: ctx({ req: user('editor@x.test') }), doc: { id: 'p1' } }), true)
    assert.deepEqual(findBlock(layout, 'p')?.props, { sku: 'ABC-123' })
    const call = noteRead.calls[0]
    assert.equal(call.id, 'p1')
    assert.equal((call.blockData as Args).blockType, 'productBlock')
    const admin = page({ note: 'secret' })
    assert.equal(await filterUnreadableProps(admin, { blocks, registry, ctx: ctx(), doc: {} }), false)
  })
})

describe('validateLayout limits are publish only', () => {
  const blocks: BlockDefinition[] = [
    {
      type: 'form',
      label: 'Form',
      fields: [
        { name: 'name', type: 'text', minLength: 3, maxLength: 5 },
        { name: 'age', type: 'number', min: 1, max: 9 },
        { name: 'tags', type: 'text', hasMany: true, maxRows: 1 },
        { name: 'rows', type: 'array', minRows: 2, fields: [{ name: 'a', type: 'text' }] },
        { name: 'mail', type: 'email' },
      ] as Field[],
    },
  ]
  it('reports lengths, ranges, rows and email addresses with the constraint code', () => {
    const layout: Layout = {
      version: 1,
      blocks: [{ id: 'f', type: 'form', props: { name: 'ab', age: 12, tags: ['a', 'b'], rows: [{ a: 'x' }], mail: 'not-an-email' } }],
    }
    const errors = validateLayout(layout, blocks)
    assert.deepEqual(
      errors.map((e) => [e.path, e.code]),
      [
        ['blocks[0].props.name', 'constraint'],
        ['blocks[0].props.age', 'constraint'],
        ['blocks[0].props.tags', 'constraint'],
        ['blocks[0].props.rows', 'constraint'],
        ['blocks[0].props.mail', 'constraint'],
      ],
    )
    assert.ok(errors.every((e) => !isBlockingError(e, false) && isBlockingError(e, true)))
    const good: Layout = { version: 1, blocks: [{ id: 'f', type: 'form', props: { mail: 'a.b+c@example.co.uk' } }] }
    assert.deepEqual(validateLayout(good, blocks), [])
  })
})

describe('sameJson', () => {
  it('compares JSON values deeply and ignores undefined keys', () => {
    assert.ok(sameJson({ a: [1, { b: 2 }], c: undefined }, { a: [1, { b: 2 }] }))
    assert.ok(!sameJson({ a: [1, 2] }, { a: [2, 1] }))
    assert.ok(!sameJson(null, undefined))
  })
})
