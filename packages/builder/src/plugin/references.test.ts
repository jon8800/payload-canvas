import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { CollectionConfig } from 'payload'

import { defaultBlocks } from '../blocks'
import type { Layout } from '../core/types'
import { addReferences, referencesBeforeChange, resolveReferences, usedByMessage, usedInFieldName } from './references'

const blocks = defaultBlocks({ mediaCollection: 'media', linkCollections: ['pages'] })
const collections = [
  { slug: 'media', upload: true, fields: [] },
  { slug: 'pages', fields: [], admin: { useAsTitle: 'title' }, versions: { drafts: true } },
  { slug: 'sections', fields: [] },
] as unknown as CollectionConfig[]
const config = resolveReferences({
  options: undefined,
  collections,
  blocks,
  sources: { pages: { layout: 'layout' }, sections: { layout: 'blocks', blocksOnly: true } },
})!

/** A layout with one image block per ID. */
const layout = (...ids: Array<string | number>): Layout => ({
  version: 1,
  blocks: ids.map((id, i) => ({ id: `i${i}`, type: 'image', props: { image: id } })),
})
const referrer = (title: string) => ({ collection: 'pages', id: 1, title, label: 'Pages' })

describe('resolveReferences', () => {
  it('derives the targets from the blocks and defaults "Used in" to upload collections', () => {
    assert.deepEqual(config.relationTo, ['media', 'pages'])
    assert.deepEqual(config.usedIn, ['media'])
    assert.deepEqual(config.protectDelete, ['media'])
    assert.equal(config.sources.pages.drafts, true)
    assert.equal(config.sources.pages.title, 'title')
    assert.equal(config.sources.sections.label, 'Sections')
  })

  it('is off with false and refuses unknown collections', () => {
    assert.equal(resolveReferences({ options: false, collections, blocks, sources: {} }), null)
    assert.throws(() => resolveReferences({ options: { usedIn: ['nope'] }, collections, blocks, sources: {} }), /does not exist/)
  })
})

describe('addReferences', () => {
  it('adds the field and hook to sources, joins and the delete hook to media', () => {
    const pages = addReferences(collections[1], config)
    assert.ok(pages.fields.some((f) => 'name' in f && f.name === 'builderRefs'))
    assert.equal(pages.hooks?.beforeChange?.length, 1)
    assert.equal(pages.hooks?.beforeDelete, undefined)

    const media = addReferences(collections[0], config)
    const collapsible = media.fields.at(-1) as { type: string; fields: Array<{ name: string; collection: string; on: string }> }
    assert.equal(collapsible.type, 'collapsible')
    assert.deepEqual(collapsible.fields.map((f) => [f.name, f.collection, f.on]), [
      ['usedInPages', 'pages', 'builderRefs'],
      ['usedInSections', 'sections', 'builderRefs'],
    ])
    assert.equal(media.hooks?.beforeDelete?.length, 1)
  })

  it('names join fields in camel case', () => {
    assert.equal(usedInFieldName('builder-templates'), 'usedInBuilderTemplates')
  })
})

describe('referencesBeforeChange', () => {
  const queries: unknown[] = []
  const payload = {
    collections: { media: { config: {} }, pages: { config: {} } },
    db: { defaultIDType: 'number' },
    logger: { warn() {} },
    find: async (args: { collection: string; where: { id: { in: Array<string | number> } } }) => {
      queries.push(args.where.id.in)
      // Media 2 does not exist.
      return { docs: args.where.id.in.filter((id) => Number(id) !== 2).map((id) => ({ id: Number(id) })) }
    },
  }
  const hook = referencesBeforeChange(config, 'pages') as unknown as (args: unknown) => Promise<Record<string, unknown>>

  it('fills the field from the layout, drops missing documents and ignores client values', async () => {
    queries.length = 0
    const data = await hook({ data: { layout: layout('1', 2, 'abc'), builderRefs: [{ relationTo: 'media', value: 9 }] }, req: { payload } })
    assert.deepEqual(data.builderRefs, [{ relationTo: 'media', value: 1 }])
    assert.deepEqual(queries, [['1', 2]])
  })

  it('trusts stored references and skips the query when nothing changed', async () => {
    queries.length = 0
    const stored = [{ relationTo: 'media', value: 1 }]
    const data = await hook({ data: { layout: layout(1) }, originalDoc: { builderRefs: stored }, req: { payload } })
    assert.deepEqual(data.builderRefs, stored)
    assert.deepEqual(queries, [])
  })

  it('keeps the stored references when the save has no layout', async () => {
    const data = await hook({ data: { title: 'x', builderRefs: [] }, req: { payload } })
    assert.equal('builderRefs' in data, false)
  })
})

describe('usedByMessage', () => {
  it('names a few documents and counts the rest', () => {
    assert.equal(
      usedByMessage([referrer('Home'), referrer('About'), referrer('Blog')], 2),
      'This document is still used by Home (Pages), About (Pages) and 1 more. Remove it from those documents first.',
    )
  })
})
