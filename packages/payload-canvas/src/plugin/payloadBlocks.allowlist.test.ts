// Regression: every collection whose layout is its own Payload blocks field offers and accepts only
// the block types that field holds, also when the app passes one shared `blocks` list (one site: the
// taxonomy layouts take no hero or pageHero). Covers the editor's config and picker, the live
// session commit (the operations endpoint) and the builder MCP tools.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Block, CollectionConfig, Config, PayloadRequest } from 'payload'
import { z } from 'zod'

import { pickerItems } from '../admin/editor/insert/picker'
import { fromPayloadBlocks } from '../blocks/payload'
import { slotAcceptsAt } from '../core/blocks'
import { payloadBlocksStorage } from '../core/payloadBlocks'
import type { BlockDefinition, BuilderClientConfig, Layout, SectionDefinition } from '../core/types'
import { actorFromUser, type LiveDocStore } from '../live/apply'
import { BUILDER_CONFIG_KEY } from '../live/document'
import { LIVE_RUNTIME_KEY, type LiveRuntime } from '../live/runtime'
import { createSessionManager } from '../live/session'
import { payloadBlocksCodec } from '../live/storage'
import { builderMcpTools } from '../mcp'
import { builderConfigFieldName, websiteBuilder } from './index'

const heading: Block = { slug: 'heading', fields: [{ name: 'text', type: 'text' }] }
const hero: Block = { slug: 'hero', fields: [{ name: 'title', type: 'text' }] }
const pageHero: Block = { slug: 'pageHero', fields: [{ name: 'title', type: 'text' }] }
const statement: Block = { slug: 'statement', fields: [{ name: 'text', type: 'text' }] }
const fullWidth: Block = { slug: 'fullWidth', fields: [{ name: 'content', type: 'blocks', blockReferences: ['heading'], blocks: [] }] }
const sectionBlocks = [hero, pageHero, statement, fullWidth]
const all = [...sectionBlocks, heading]
const layoutOf = (slugs: string[]) => ({ name: 'layout', type: 'blocks', blockReferences: slugs, blocks: [] }) as never
const pages: CollectionConfig = { slug: 'pages', fields: [layoutOf(['hero', 'pageHero', 'statement', 'fullWidth'])] }
const services: CollectionConfig = { slug: 'services', fields: [layoutOf(['statement', 'fullWidth'])] }

/** The editor config of each collection, built from one shared block list. */
function clientConfigs(blocks: BlockDefinition[]): Record<string, BuilderClientConfig> {
  const config = websiteBuilder({
    collections: { pages: { field: 'layout' }, services: { field: 'layout' } },
    blocks,
    css: { entry: 'globals.css' },
    theme: false,
  })({ collections: [pages, services], blocks: all, secret: 'x' } as Config) as Config
  const out: Record<string, BuilderClientConfig> = {}
  for (const slug of ['pages', 'services']) {
    const collection = config.collections!.find((c) => c.slug === slug)!
    const field = collection.fields.find((f) => 'name' in f && f.name === builderConfigFieldName('layout')) as { admin: { custom: { builder: BuilderClientConfig } } }
    out[slug] = field.admin.custom.builder
  }
  return out
}

const EMPTY: Layout = { version: 1, blocks: [] }
const rootPicks = (config: BuilderClientConfig, layout: Layout = EMPTY, parentId: string | null = null, slot = 'children') =>
  pickerItems({ blocks: config.blocks, sections: config.sections, layout, parentId, slot, query: '' }).flatMap((item) => (item.kind === 'block' ? [item.type] : []))

for (const [name, options] of [
  ['with the `root` option', { root: sectionBlocks.map((b) => b.slug) }],
  ['without the `root` option', {}],
] as const) {
  describe(`A shared block list on two Payload blocks fields (${name})`, () => {
    const blocks = fromPayloadBlocks(all, { references: all, prefix: 'site', onWarning: false, ...options })
    const configs = clientConfigs(blocks)

    it('offers each collection only the blocks its field accepts at the top level', () => {
      assert.deepEqual(rootPicks(configs.services).toSorted(), ['siteFullWidth', 'siteStatement'])
      assert.deepEqual(rootPicks(configs.pages).toSorted(), ['siteFullWidth', 'siteHero', 'sitePageHero', 'siteStatement'])
    })

    it('offers inside a nested blocks field only the blocks that field accepts', () => {
      const layout: Layout = { version: 1, blocks: [{ id: 'fw', type: 'siteFullWidth', slots: { content: [] } }] }
      assert.deepEqual(rootPicks(configs.services, layout, 'fw', 'content'), ['siteHeading'])
      assert.equal(slotAcceptsAt(configs.services.blocks, EMPTY, null, 'children', 'siteHeading'), false, 'a nested-only block is refused at the top level')
    })
  })
}

describe('payloadBlocksStorage', () => {
  it('limits a block the field holds only inside other blocks to those blocks, without changing the shared definition', () => {
    const blocks = fromPayloadBlocks(all, { references: all, onWarning: false })
    const storage = payloadBlocksStorage(['statement', 'fullWidth'], blocks, '"services.layout"')
    assert.deepEqual(storage.blocks.find((b) => b.type === 'heading')?.parents, ['fullWidth'])
    assert.equal(storage.blocks.find((b) => b.type === 'statement')?.parents, undefined)
    assert.equal(blocks.find((b) => b.type === 'heading')?.parents, undefined)
  })
})

describe('Server side: a block the field does not accept', () => {
  const blocks = fromPayloadBlocks(all, { references: all, root: sectionBlocks.map((b) => b.slug), prefix: 'site', onWarning: false })
  const servicesStorage = payloadBlocksStorage(['statement', 'fullWidth'], blocks, '"services.layout"')
  const pagesStorage = payloadBlocksStorage(['hero', 'pageHero', 'statement', 'fullWidth'], blocks, '"pages.layout"')
  const user = { id: 1, email: 'ed@x.test' }

  it('the live session commit (the operations endpoint) refuses it and saves nothing', async () => {
    const sessions = createSessionManager({ persistDebounceMs: 5 })
    let writes = 0
    const store: LiveDocStore = {
      async findByID() {
        return { id: 's1', layout: [] }
      },
      async update(args) {
        writes += 1
        return { id: 's1', ...(args.data as object) }
      },
    }
    const target = { collection: 'services', id: 's1', field: 'layout', drafts: false, codec: payloadBlocksCodec(servicesStorage) }
    const commit = (block: Record<string, unknown>) =>
      sessions.commit({ target, store, user, actor: actorFromUser(user), blocks, ops: [{ type: 'insert', block, to: { parentId: null, slot: 'children', index: 0 } }] })
    const refused = await commit({ id: 'h1', type: 'siteHero', props: { title: 'Hi' } })
    assert.equal(refused.ok, false)
    assert.equal(!refused.ok && refused.status, 422)
    const nested = await commit({ id: 'h2', type: 'siteHeading', props: { text: 'Hi' } })
    assert.equal(nested.ok, false, 'a nested-only block is refused at the top level')
    assert.equal((await commit({ id: 's1b', type: 'siteStatement', props: { text: 'Hi' } })).ok, true)
    await sessions.flush('services', 's1')
    assert.equal(writes, 1)
  })

  const openingSection: SectionDefinition = { id: 'opening', label: 'Opening', blocks: [{ id: 'o', type: 'siteHero', props: { title: 'Hi' } }] }
  const statementSection: SectionDefinition = { id: 'statement', label: 'Statement', blocks: [{ id: 's', type: 'siteStatement', props: { text: 'Hi' } }] }
  const tools = builderMcpTools({ blocks, sections: [openingSection, statementSection], collections: { pages: { field: 'layout' }, services: { field: 'layout' } } })
  const tool = (name: string) => tools.find((t) => t.name === name)!
  const runtime: LiveRuntime = { sessions: createSessionManager({ persistDebounceMs: 5 }), canUpdate: async () => true }
  const req = {
    user,
    payload: {
      collections: { pages: { config: {} }, services: { config: {} } },
      config: {
        serverURL: '',
        routes: { admin: '/admin' },
        custom: {
          [LIVE_RUNTIME_KEY]: runtime,
          [BUILDER_CONFIG_KEY]: { collections: { pages: { field: 'layout', payloadBlocks: pagesStorage }, services: { field: 'layout', payloadBlocks: servicesStorage } }, blocks },
        },
      },
      async findByID() {
        return { id: 's1', layout: [] }
      },
    },
  } as unknown as PayloadRequest
  const call = async (name: string, value: Record<string, unknown>) => {
    const parsed = z.object(tool(name).parameters).parse(value)
    const result = await tool(name).handler(parsed, req, {})
    return { isError: Boolean((result as { isError?: boolean }).isError), body: result.content[0].text }
  }

  it('listBlocks and getBlockSchema list only the blocks of the collection', async () => {
    const servicesList = JSON.parse((await call('listBlocks', { collection: 'services' })).body) as { blocks: { type: string }[]; rootTypes: string[]; sections: number }
    assert.deepEqual(servicesList.blocks.map((b) => b.type).toSorted(), ['siteFullWidth', 'siteHeading', 'siteStatement'])
    assert.deepEqual(servicesList.rootTypes, ['siteStatement', 'siteFullWidth'])
    assert.equal(servicesList.sections, 1)
    const pagesList = JSON.parse((await call('listBlocks', { collection: 'pages' })).body) as { blocks: { type: string }[] }
    assert.ok(pagesList.blocks.some((b) => b.type === 'siteHero'))
    const schema = await call('getBlockSchema', { collection: 'services', type: 'siteHero' })
    assert.equal(schema.isError, true)
    assert.match(schema.body, /Unknown block type "siteHero"/)
  })

  it('listSections leaves out sections the field cannot hold, and insertSection refuses them', async () => {
    const listed = JSON.parse((await call('listSections', { collection: 'services' })).body) as { sections: { id: string }[] }
    assert.deepEqual(listed.sections.map((s) => s.id), ['statement'])
    const inserted = await call('insertSection', { collection: 'services', id: 's1', sectionId: 'opening' })
    assert.equal(inserted.isError, true)
    assert.match(inserted.body, /cannot go in "services"/)
    const pagesListed = JSON.parse((await call('listSections', { collection: 'pages' })).body) as { sections: { id: string }[] }
    assert.deepEqual(pagesListed.sections.map((s) => s.id), ['opening', 'statement'])
  })
})
