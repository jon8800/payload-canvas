import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Block, CollectionConfig, Config } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import { createEditorStore } from '../admin/editor/store'
import { storageProblemOf } from '../admin/editor/storage'
import { hasStyles, setStylesOps } from '../admin/editor/menu/styleClipboard'
import { createSectionsController } from '../admin/editor/sections/controller'
import { getBlockDefinition } from '../core/blocks'
import type { BuilderClientConfig, Layout, SectionDefinition } from '../core/types'
import { createFieldClock, createFieldHistory, keepNewerField } from '../live/fieldsGuard'
import { builderConfigFieldName, websiteBuilder } from './index'

const card: Block = { slug: 'card', fields: [{ name: 'title', type: 'text' }] }
const section: Block = { slug: 'section', fields: [{ name: 'content', type: 'blocks', blocks: [card] }] }
const layoutField = { name: 'layout', type: 'blocks', blocks: [section], admin: { initCollapsed: true } } as const
const pages: CollectionConfig = { slug: 'pages', versions: { drafts: true }, fields: [{ name: 'title', type: 'text' }, layoutField as never] }
const posts: CollectionConfig = { slug: 'posts', fields: [{ name: 'title', type: 'text' }] }
const base = { collections: [pages, posts], secret: 'x' } as Config
const blocks = [
  ...fromPayloadBlocks([section], { onWarning: false }),
  // A builder block the blocks field does not hold.
  { type: 'stack', label: 'Stack', fields: [], slots: { children: {} } },
]
const sections: SectionDefinition[] = [
  { id: 'fits', label: 'Fits', blocks: [{ id: 's', type: 'section', slots: { content: [{ id: 'c', type: 'card', props: { title: 'Hi' } }] } }] },
  { id: 'styled', label: 'Styled', blocks: [{ id: 's', type: 'section', className: 'p-8' }] },
  { id: 'other', label: 'Other', blocks: [{ id: 's', type: 'stack' }] },
]

const build = (extra: Record<string, unknown> = {}) =>
  websiteBuilder({ collections: { pages: { ...extra }, posts: {} }, blocks, sections, css: { entry: 'globals.css' }, theme: false })(base) as Config
const collectionOf = (config: Config, slug: string) => config.collections!.find((c) => c.slug === slug)!
const fieldOf = (collection: CollectionConfig, name: string) => collection.fields.find((f) => 'name' in f && f.name === name) as Record<string, unknown> | undefined

describe('websiteBuilder on a Payload blocks field', () => {
  it('keeps the blocks field exactly as declared and adds no layout copy', () => {
    const config = build()
    const pagesConfig = collectionOf(config, 'pages')
    assert.equal(fieldOf(pagesConfig, 'layout'), layoutField as never, 'the same field object')
    assert.equal(fieldOf(pagesConfig, 'layoutCss'), undefined)
    const builder = fieldOf(pagesConfig, builderConfigFieldName('layout')) as { type: string; virtual: boolean; admin: { hidden: boolean } }
    assert.equal(builder.type, 'json')
    assert.equal(builder.virtual, true)
    assert.equal(builder.admin.hidden, true)
    // The JSON collection next to it keeps the builder's JSON field.
    assert.equal((fieldOf(collectionOf(config, 'posts'), 'layout') as { type: string }).type, 'json')
  })

  it('gives the editor the field’s own block types and the sections it can store', () => {
    const pagesConfig = collectionOf(build(), 'pages')
    const client = (fieldOf(pagesConfig, 'layoutBuilder') as { admin: { custom: { builder: BuilderClientConfig } } }).admin.custom.builder
    assert.equal(client.storage, 'payload-blocks')
    assert.deepEqual(
      client.blocks.map((b) => b.type),
      ['section', 'card'],
    )
    assert.deepEqual(
      client.sections.map((s) => s.id),
      ['fits'],
    )
    assert.equal(client.localization ?? null, null)
  })

  it('refuses setups it cannot keep as one source of truth', () => {
    assert.throws(() => build({ templates: true }), /templates hold builder JSON layouts/)
    assert.throws(
      () => websiteBuilder({ collections: { pages: {} }, blocks: [], css: { entry: 'globals.css' }, theme: false })(base),
      /no definition for its block "section"/,
    )
  })
})

/** A fresh field history and field clock. */
const setup = () => {
  const history = createFieldHistory()
  const clock = createFieldClock()
  const args = { history, clock, collection: 'pages', id: 1, field: 'layout' }
  return { history, clock, args }
}

describe('keepNewerField: a stale form and a field two editors write', () => {
  const T0 = '2026-01-01T00:00:00.000Z'
  const T1 = '2026-01-01T00:00:01.000Z'

  it('keeps the newer value when the form left the field as it loaded it', () => {
    const { history, clock, args } = setup()
    history.remember('pages', 1, 'layout', T0, ['old'])
    clock.record('pages', 1, ['layout'], { at: T1, by: 'users:1', label: 'Ana' })
    const data = { updatedAt: T0, layout: ['old'], title: 'New title' }
    assert.deepEqual(keepNewerField({ ...args, data, originalDoc: { updatedAt: T1, layout: ['new'] } }), [])
    assert.deepEqual(data.layout, ['new'])
  })

  it('refuses a change made on an old copy, also when the same person made the newer change', () => {
    const { history, clock, args } = setup()
    history.remember('pages', 1, 'layout', T0, ['old'])
    clock.record('pages', 1, ['layout'], { at: T1, by: 'users:1', label: 'Ana' })
    const data = { updatedAt: T0, layout: ['edited'] }
    const conflicts = keepNewerField({ ...args, data, originalDoc: { updatedAt: T1, layout: ['new'] } })
    assert.deepEqual(
      conflicts.map((c) => c.field),
      ['layout'],
    )
    assert.deepEqual(data.layout, ['edited'], 'the form keeps its input')
  })

  it('saves a change when the field did not change since the form loaded', () => {
    const { history, args } = setup()
    history.remember('pages', 1, 'layout', T0, ['same'])
    const data = { updatedAt: T0, layout: ['edited'] }
    assert.deepEqual(keepNewerField({ ...args, data, originalDoc: { updatedAt: T1, layout: ['same'] } }), [])
    assert.deepEqual(data.layout, ['edited'])
  })

  it('checks nothing for a form that is up to date', () => {
    const { clock, args } = setup()
    clock.record('pages', 1, ['layout'], { at: T1, by: 'users:1', label: 'Ana' })
    const data = { updatedAt: T1, layout: ['edited'] }
    assert.deepEqual(keepNewerField({ ...args, data, originalDoc: { updatedAt: T1, layout: ['new'] } }), [])
  })
})

describe('A Payload blocks field next to JSON layouts, with styles on in the definitions', () => {
  const styled = fromPayloadBlocks([section], { onWarning: false, styles: true, overrides: { card: { defaultClassName: 'p-4' } } })
  const config = websiteBuilder({ collections: { pages: {}, posts: {} }, blocks: styled, sections, css: { entry: 'globals.css' }, theme: false })(base) as Config
  const clientOf = (slug: string, name: string) =>
    (fieldOf(collectionOf(config, slug), name) as { admin: { custom: { builder: BuilderClientConfig } } }).admin.custom.builder

  it('gives the blocks field no style controls, and keeps them for the JSON collection', () => {
    const pagesClient = clientOf('pages', 'layoutBuilder')
    for (const def of pagesClient.blocks) {
      assert.equal(def.styles, false, def.type)
      assert.equal(def.defaultClassName, undefined, def.type)
    }
    assert.deepEqual(pagesClient.payloadRootTypes, ['section'])
    const postsClient = clientOf('posts', 'layout')
    assert.equal(postsClient.storage, undefined)
    assert.notEqual(getBlockDefinition(postsClient.blocks, 'card')?.styles, false)
    assert.equal(getBlockDefinition(postsClient.blocks, 'card')?.defaultClassName, 'p-4')
  })

  it('makes paste styles a no-op there: no block of the field has style controls', () => {
    const pagesClient = clientOf('pages', 'layoutBuilder')
    const layout: Layout = { version: 1, blocks: [{ id: 's', type: 'section', slots: { content: [{ id: 'c', type: 'card' }] } }] }
    assert.equal(hasStyles(pagesClient.blocks, 'card'), false)
    assert.deepEqual(setStylesOps(layout, pagesClient.blocks, ['s', 'c'], { className: 'p-8' }), [])
  })

  it('refuses an own edit the field cannot store before it shows, and lets JSON layouts store it', () => {
    const pagesClient = clientOf('pages', 'layoutBuilder')
    const check = storageProblemOf(pagesClient)
    assert.ok(check)
    const layout: Layout = { version: 1, blocks: [{ id: 's', type: 'section' }] }
    const store = createEditorStore(layout, { storageProblem: check })
    assert.equal(store.apply({ type: 'update', id: 's', className: 'p-8' }), false)
    assert.match(String(store.getState().lastError), /cannot store Tailwind classes/)
    assert.equal(store.getState().layout.blocks[0].className, undefined)
    assert.equal(store.apply({ type: 'insert', block: { id: 'x', type: 'card' }, to: { parentId: null, index: 1 } }), false, 'not allowed at the top')
    assert.equal(store.apply({ type: 'insert', block: { id: 'y', type: 'card' }, to: { parentId: 's', slot: 'content', index: 0 } }), true)
    assert.equal(storageProblemOf(clientOf('posts', 'layout')), null)
    const json = createEditorStore(layout)
    assert.equal(json.apply({ type: 'update', id: 's', className: 'p-8' }), true)
  })

  it('lists only the saved sections the field can store', async () => {
    const pagesClient = clientOf('pages', 'layoutBuilder')
    const check = storageProblemOf(pagesClient)!
    const docs = [
      { id: 1, name: 'Fits', blocks: [{ id: 'a', type: 'section', slots: { content: [{ id: 'b', type: 'card' }] } }] },
      { id: 2, name: 'Styled', blocks: [{ id: 'a', type: 'section', className: 'p-8' }] },
      { id: 3, name: 'Animated', blocks: [{ id: 'a', type: 'section', motion: { enter: { preset: 'fade-up' } } }] },
      { id: 4, name: 'Other type', blocks: [{ id: 'a', type: 'stack' }] },
    ]
    const realFetch = globalThis.fetch
    globalThis.fetch = (async () => Response.json({ docs })) as typeof fetch
    try {
      const filtered = createSectionsController('/api', 'builder-sections', (s) => check({ version: 1, blocks: s.blocks }) === null)
      await filtered.load()
      assert.deepEqual(
        filtered.saved.get()?.map((s) => s.label),
        ['Fits'],
      )
      const all = createSectionsController('/api', 'builder-sections')
      await all.load()
      assert.equal(all.saved.get()?.length, 4, 'JSON layouts keep every saved section')
    } finally {
      globalThis.fetch = realFetch
    }
  })
})
