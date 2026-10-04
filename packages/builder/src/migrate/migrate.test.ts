import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Payload } from 'payload'

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

/** A fake Payload with the Local API reads and the adapter writes the migration uses. */
function fakePayload(options: { docs: Row[]; versions: VersionRow[]; adapter?: string }) {
  const writes: Array<{ kind: 'doc' | 'version'; id: unknown; data: unknown }> = []
  const payload = {
    config: { custom: {} },
    collections: {
      pages: {
        config: {
          versions: { drafts: true },
          flattenedFields: [
            { name: 'title', type: 'text' },
            { name: 'layout', type: 'blocks' },
            { name: 'builderLayout', type: 'json' },
            { name: 'builderLayoutCss', type: 'json' },
          ],
        },
      },
    },
    find: async ({ page: n, limit }: { page: number; limit: number }) => page(options.docs, n, limit),
    findVersions: async ({ page: n, limit, where }: { page: number; limit: number; where: { parent: { equals: unknown } } }) =>
      page(options.versions.filter((v) => v.parent === where.parent.equals), n, limit),
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
  return { payload: payload as unknown as Payload, writes }
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
