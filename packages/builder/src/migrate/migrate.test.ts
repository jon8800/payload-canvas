import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Block as PayloadBlock, Payload } from 'payload'

import { fromPayloadBlocks } from '../blocks/payload'
import { twoLevelConfigBlocks } from '../blocks/payloadFixtures.test-data'
import { formatMigrationReport, migrateBlocksField } from './index'

const blocks = fromPayloadBlocks(twoLevelConfigBlocks, { onWarning: false, root: ['fullWidth', 'twoColumn'] })

type Row = { id: number | string; [key: string]: unknown }
type VersionRow = { id: string; parent: number | string; version: Record<string, unknown> }

const page = <T,>(list: T[], n: number, size: number) => ({ docs: list.slice((n - 1) * size, n * size), hasNextPage: n * size < list.length })

const section = (id: string, text: string) => [
  { id, blockType: 'fullWidth', paddingTop: 'small', content: [{ id: `${id}h`, blockType: 'heading', text, level: 'h2' }] },
]

type Localization = { locales: string[]; defaultLocale: string }

/**
 * The data as a read in the default locale returns it. The fake stores localized data the way a
 * `locale: 'all'` read returns it: objects whose keys are all locale codes are locale maps.
 */
function inDefaultLocale(value: unknown, localization: Localization): unknown {
  if (Array.isArray(value)) return value.map((item) => inDefaultLocale(item, localization))
  if (typeof value !== 'object' || value === null) return value
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length > 0 && keys.every((key) => localization.locales.includes(key))) return inDefaultLocale(record[localization.defaultLocale], localization)
  return Object.fromEntries(keys.map((key) => [key, inDefaultLocale(record[key], localization)]))
}

/** A fake Payload with the Local API reads and the adapter writes the migration uses. */
function fakePayload(options: { docs: Row[]; versions: VersionRow[]; adapter?: string; localization?: Localization; layoutField?: Record<string, unknown> }) {
  const writes: Array<{ kind: 'doc' | 'version'; id: unknown; data: unknown }> = []
  const reads: Array<string | undefined> = []
  const { localization } = options
  // Without `locale: 'all'` a read gives the default locale (Payload's default `locale`).
  const read = <T,>(row: T, locale: string | undefined): T => (localization && locale !== 'all' ? (inDefaultLocale(row, localization) as T) : row)
  const payload = {
    config: { custom: {}, ...(localization ? { localization } : {}) },
    collections: {
      pages: {
        config: {
          versions: { drafts: true },
          flattenedFields: [
            { name: 'title', type: 'text' },
            { name: 'layout', type: 'blocks', ...options.layoutField },
            { name: 'builderLayout', type: 'json' },
            { name: 'builderLayoutCss', type: 'json' },
          ],
        },
      },
    },
    blocks: {},
    find: async ({ page: n, limit, locale }: { page: number; limit: number; locale?: string }) => {
      reads.push(locale)
      return page(
        options.docs.map((d) => read(d, locale)),
        n,
        limit,
      )
    },
    findVersions: async ({ page: n, limit, where, locale }: { page: number; limit: number; where: { parent: { equals: unknown } }; locale?: string }) => {
      reads.push(locale)
      return page(
        options.versions.filter((v) => v.parent === where.parent.equals).map((v) => read(v, locale)),
        n,
        limit,
      )
    },
    db: {
      name: options.adapter ?? 'postgres',
      updateOne: async ({ id, data }: { id: unknown; data: Record<string, unknown> }) => {
        writes.push({ kind: 'doc', id, data })
        const doc = options.docs.find((d) => d.id === id)
        if (doc) Object.assign(doc, data)
      },
      updateVersion: async ({ id, versionData }: { id: unknown; versionData: { version: Record<string, unknown> } }) => {
        writes.push({ kind: 'version', id, data: versionData })
        const version = options.versions.find((v) => v.id === id)
        if (version) Object.assign(version.version, versionData.version)
      },
    },
  }
  return { payload: payload as unknown as Payload, writes, reads }
}

function fixture() {
  const docs: Row[] = Array.from({ length: 105 }, (_, i) => ({ id: i + 1, title: `Page ${i + 1}`, layout: section(`s${i + 1}`, `Hello ${i + 1}`) }))
  docs.push({ id: 200, title: 'Empty', layout: [] })
  docs.push({ id: 201, title: 'Done', layout: section('d', 'Old'), builderLayout: { version: 1, blocks: [{ id: 'x', type: 'heading', props: { text: 'New' } }] } })
  const versions: VersionRow[] = [
    { id: 'v1', parent: 1, version: { title: 'Page 1', layout: section('s1', 'Draft 1') } },
    { id: 'v2', parent: 1, version: { title: 'Page 1', layout: [{ id: 'o', blockType: 'oldPromo' }] } },
  ]
  return { docs, versions }
}

describe('migrateBlocksField', () => {
  it('reports without writing in a dry run (the default)', async () => {
    const { payload, writes } = fakePayload(fixture())
    const report = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks })
    assert.equal(writes.length, 0)
    assert.equal(report.dryRun, true)
    assert.deepEqual(report.documents, { found: 107, converted: 105, skipped: 1, empty: 1, failed: 0 })
    assert.deepEqual(report.versions, { found: 2, converted: 1, skipped: 0, empty: 1, failed: 0 })
    assert.deepEqual(report.unknownTypes, { oldPromo: 1 })
    assert.equal(report.blocks, 106 * 2)
    assert.match(formatMigrationReport(report), /dry run: nothing written/)
  })

  it('writes the layout and its CSS to documents and versions, then skips them on a second run', async () => {
    const data = fixture()
    const { payload, writes } = fakePayload(data)
    await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks, dryRun: false })
    assert.equal(writes.filter((w) => w.kind === 'doc').length, 105)
    assert.equal(writes.filter((w) => w.kind === 'version').length, 1)
    const first = data.docs[0]
    assert.equal((first.builderLayout as { blocks: Array<{ type: string }> }).blocks[0].type, 'fullWidth')
    assert.deepEqual(Object.keys(first.builderLayoutCss as object), ['hash', 'css'])
    assert.deepEqual(data.docs[0].layout, section('s1', 'Hello 1'), 'the old field stays')
    assert.equal((data.versions[0].version.builderLayout as { blocks: unknown[] }).blocks.length, 1)

    const again = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks, dryRun: false })
    assert.equal(again.documents.converted, 0)
    assert.equal(again.documents.skipped, 106)
    assert.equal(again.versions.skipped, 1)
    assert.equal(writes.length, 106)
  })

  it('overwrites only changed layouts with `overwrite`', async () => {
    const data = fixture()
    const { payload } = fakePayload(data)
    await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks, dryRun: false })
    const report = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks, dryRun: true, overwrite: true })
    // Unchanged conversions are skipped; the document whose builder field holds other content converts.
    assert.equal(report.documents.converted, 1)
    assert.equal(report.documents.skipped, 105)
  })

  it('reports layouts that need a fix', async () => {
    const docs: Row[] = [{ id: 1, layout: [{ id: 'h', blockType: 'heading', level: 'h9' }] }]
    const { payload } = fakePayload({ docs, versions: [] })
    const report = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks })
    // A select value that is not an option blocks saving; the empty required text and the heading
    // outside a section block publishing.
    assert.deepEqual(
      report.problems.map((p) => p.blocking),
      ['save', 'publish', 'publish'],
    )
  })

  it('leaves versions out on MongoDB and checks the fields', async () => {
    const { payload } = fakePayload({ ...fixture(), adapter: 'mongoose' })
    const report = await migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks })
    assert.equal(report.versions.found, 0)
    assert.match(report.versionsSkipped ?? '', /MongoDB/)
    await assert.rejects(() => migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'title', blocks }), /no builder field "title"/)
    await assert.rejects(() => migrateBlocksField(payload, { collection: 'nope', from: 'layout', to: 'builderLayout', blocks }), /does not exist/)
  })
})

// ---------------------------------------------------------------------------
// Localization
// ---------------------------------------------------------------------------

const title: PayloadBlock = {
  slug: 'title',
  fields: [
    { name: 'text', type: 'text', localized: true },
    { name: 'level', type: 'select', options: ['h2', 'h3'] },
  ],
}
const links: PayloadBlock = {
  slug: 'links',
  fields: [
    {
      name: 'items',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', localized: true },
        { name: 'url', type: 'text' },
      ],
    },
  ],
}
const area: PayloadBlock = {
  slug: 'area',
  fields: [
    { name: 'tone', type: 'select', options: ['light', 'dark'] },
    { name: 'content', type: 'blocks', blocks: [title, links] },
  ],
}
const localizedBlocks = fromPayloadBlocks([area, title, links], { onWarning: false })
const locales: Localization = { locales: ['en', 'de', 'fr'], defaultLocale: 'en' }
const migrate = (payload: Payload) =>
  migrateBlocksField(payload, { collection: 'pages', from: 'layout', to: 'builderLayout', blocks: localizedBlocks, dryRun: false })
const blocksOf = (row: Row | VersionRow['version']) => (row.builderLayout as { blocks: unknown }).blocks

/** A title block as a `locale: 'all'` read returns it. */
const titleIn = (text: Record<string, string>) => [{ id: 'h1', blockType: 'title', text, level: 'h2' }]

describe('migrateBlocksField with localization', () => {
  it('keeps the translations of fields localized inside the blocks', async () => {
    // A `locale: 'all'` read: localized fields are locale maps where they are localized.
    const docs: Row[] = [
      {
        id: 1,
        layout: [
          { id: 's1', blockType: 'area', tone: 'dark', content: [{ id: 'h1', blockType: 'title', text: { en: 'Hello', de: 'Hallo', fr: null }, level: 'h2' }] },
          {
            id: 'l1',
            blockType: 'links',
            items: [
              { id: 'r1', label: { en: 'Home', de: 'Start' }, url: '/' },
              { id: 'r2', label: { en: 'Blog' }, url: '/blog' },
            ],
          },
        ],
      },
    ]
    const { payload, reads } = fakePayload({ docs, versions: [], localization: locales, layoutField: { blocks: [area, title, links] } })
    const report = await migrate(payload)
    assert.deepEqual(reads, ['all', 'all'], 'the document and its versions')
    assert.deepEqual(report.locales, ['en', 'de', 'fr'])
    assert.deepEqual(blocksOf(docs[0]), [
      {
        id: 's1',
        type: 'area',
        props: { tone: 'dark' },
        // French has no text of its own: no value, so the fallback shows English.
        slots: { content: [{ id: 'h1', type: 'title', props: { text: 'Hello', level: 'h2' }, locales: { de: { text: 'Hallo' } } }] },
      },
      {
        id: 'l1',
        type: 'links',
        props: {
          items: [
            { id: 'r1', label: 'Home', url: '/' },
            { id: 'r2', label: 'Blog', url: '/blog' },
          ],
        },
        // The array holds a localized field, so it translates as a whole. A label German lacks
        // takes Payload's fallback; French has no label of its own, so it stores nothing.
        locales: {
          de: {
            items: [
              { id: 'r1', label: 'Start', url: '/' },
              { id: 'r2', label: 'Blog', url: '/blog' },
            ],
          },
        },
      },
    ])
    assert.deepEqual(report.unmatchedBlocks, [])
    assert.match(formatMigrationReport(report), /Languages: en, de, fr/)
  })

  it('matches the blocks of a localized blocks field by id, then by position and type', async () => {
    const docs: Row[] = [
      {
        id: 1,
        layout: {
          en: [
            { id: 'e1', blockType: 'title', text: 'Hello', level: 'h2' },
            { id: 'e2', blockType: 'title', text: 'Only in English', level: 'h3' },
            { id: 'e3', blockType: 'links', items: [{ id: 'r1', label: 'Home', url: '/' }] },
          ],
          de: [
            { id: 'd1', blockType: 'title', text: 'Hallo', level: 'h3' },
            { id: 'e3', blockType: 'links', items: [{ id: 'r9', label: 'Start', url: '/' }] },
            { id: 'd9', blockType: 'title', text: 'Nur auf Deutsch' },
          ],
        },
      },
    ]
    const { payload } = fakePayload({ docs, versions: [], localization: locales, layoutField: { localized: true, blocks: [area, title, links] } })
    const report = await migrate(payload)
    assert.deepEqual(blocksOf(docs[0]), [
      // Matched by position and type.
      { id: 'e1', type: 'title', props: { text: 'Hello', level: 'h2' }, locales: { de: { text: 'Hallo' } } },
      // No German block: German shows the English text (fallback).
      { id: 'e2', type: 'title', props: { text: 'Only in English', level: 'h3' } },
      // Matched by id.
      { id: 'e3', type: 'links', props: { items: [{ id: 'r1', label: 'Home', url: '/' }] }, locales: { de: { items: [{ id: 'r9', label: 'Start', url: '/' }] } } },
    ])
    assert.deepEqual(report.unmatchedBlocks, [{ id: 1, locale: 'de', block: 'd9', blockType: 'title' }])
    assert.deepEqual(report.notLocalizedFields, { title: ['level'] })
    const text = formatMigrationReport(report)
    assert.match(text, /no matching block in the default language \(left out\) \(1\):\n {2}1: DE title d9/)
    assert.match(text, /not localized in the block definitions .*title: level/)
  })

  it('converts the versions with every locale too', async () => {
    const docs: Row[] = [{ id: 1, layout: titleIn({ en: 'Hello', de: 'Hallo' }) }]
    const versions: VersionRow[] = [{ id: 'v1', parent: 1, version: { layout: titleIn({ en: 'Draft', de: 'Entwurf' }) } }]
    const { payload, reads } = fakePayload({ docs, versions, localization: locales, layoutField: { blocks: [area, title, links] } })
    const report = await migrate(payload)
    assert.deepEqual(reads, ['all', 'all'])
    assert.equal(report.versions.converted, 1)
    assert.deepEqual(blocksOf(docs[0]), [{ id: 'h1', type: 'title', props: { text: 'Hello', level: 'h2' }, locales: { de: { text: 'Hallo' } } }])
    assert.deepEqual(blocksOf(versions[0].version), [{ id: 'h1', type: 'title', props: { text: 'Draft', level: 'h2' }, locales: { de: { text: 'Entwurf' } } }])
  })

  it('reads one locale as before when nothing in the field is localized', async () => {
    const plain: PayloadBlock = { slug: 'title', fields: [{ name: 'text', type: 'text' }] }
    const docs: Row[] = [{ id: 1, layout: [{ id: 'h1', blockType: 'title', text: 'Hello' }] }]
    const { payload, reads } = fakePayload({ docs, versions: [], localization: locales, layoutField: { blocks: [plain] } })
    const report = await migrate(payload)
    assert.deepEqual(reads, [undefined, undefined])
    assert.equal(report.locales, undefined)
    assert.deepEqual(blocksOf(docs[0]), [{ id: 'h1', type: 'title', props: { text: 'Hello' } }])
    assert.doesNotMatch(formatMigrationReport(report), /Languages/)
  })
})
