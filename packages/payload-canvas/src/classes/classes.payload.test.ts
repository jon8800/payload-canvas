// Editable classes through the real Payload Local API (memory database): name checks, the
// published stylesheet (compile, hash, route), drafts, usage, rename, delete, publishing with a
// page, import from the site's CSS, page CSS without the class names, and the MCP tools.

import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildConfig, createLocalReq, getPayload, type CollectionConfig, type Payload, type PayloadRequest } from 'payload'

import type { BlockDefinition, Layout } from '../core/types'
import { liveRuntimeOf } from '../live/runtime'
import { builderMcpTools } from '../mcp'
import { memoryAdapter } from '../plugin/memoryAdapter.test-data'
import { websiteBuilder } from '../plugin'
import { compilePageCss } from '../react/server'
import { CLASSES_SHEET_PATH, classUsage, deleteClass, importSiteClasses, loadClassesSheet, publishClass, renameClass, upsertClass } from './index'

const here = path.dirname(fileURLToPath(import.meta.url))
// Written at test time inside the package, so `@import "tailwindcss"` resolves.
const dir = path.join(here, '../../node_modules/.cache/payload-canvas-classes-test')
const ENTRY = [
  '@import "tailwindcss";',
  '/* @canvas Surfaces: Code card */',
  '@utility card-code {\n  @apply rounded-lg p-4;\n  border: 1px solid red;\n}',
  '@utility plain-code {\n  @apply flex gap-2;\n}',
].join('\n')

const all = { read: () => true, create: () => true, update: () => true, delete: () => true }
const pages: CollectionConfig = {
  slug: 'pages',
  versions: { drafts: true },
  access: all,
  admin: { useAsTitle: 'title' },
  fields: [{ name: 'title', type: 'text' }],
}
const heading: BlockDefinition = { type: 'heading', label: 'Heading', fields: [{ name: 'text', type: 'text' }] }
const admin = { id: 1, collection: 'users', email: 'admin@example.test' }
const SLUG = 'builder-classes'

let payload: Payload
const asAdmin = async () => (await createLocalReq({ user: admin as never }, payload)) as PayloadRequest
const flush = () => liveRuntimeOf(payload).sessions.flushAll()
const layoutOf = (classes: string[]): Layout => ({ version: 1, blocks: classes.map((className, i) => ({ id: `b${i}`, type: 'heading', props: { text: `T${i}` }, ...(className ? { className } : {}) })) })
const classNames = (doc: Record<string, unknown>) => ((doc.layout as Layout).blocks ?? []).map((b) => b.className ?? '')

async function createPage(title: string, classes: string[], published = true) {
  return (await payload.create({
    collection: 'pages',
    data: { title, layout: layoutOf(classes), _status: published ? 'published' : 'draft' } as never,
    draft: !published,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> & { id: number }
}

const page = (id: number, draft: boolean) =>
  payload.findByID({ collection: 'pages', id, draft, depth: 0, overrideAccess: true }) as unknown as Promise<Record<string, unknown>>
const cls = (id: string | number, draft: boolean) =>
  payload.findByID({ collection: SLUG as never, id, draft, depth: 0, overrideAccess: true }) as unknown as Promise<Record<string, unknown>>

before(async () => {
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'entry.css'), ENTRY)
  const config = await buildConfig({
    secret: 'test-secret-not-used-anywhere',
    telemetry: false,
    typescript: { autoGenerate: false },
    db: memoryAdapter().adapter,
    collections: [{ slug: 'users', auth: true, fields: [] }, pages],
    plugins: [websiteBuilder({ collections: { pages: {} }, blocks: [heading], css: { entry: path.join(dir, 'entry.css') }, theme: false })],
  })
  payload = await getPayload({ config })
})

describe('editable classes', { concurrency: false, timeout: 60_000 }, () => {
  let cardId: string | number
  let homeId: number

  it('refuses names that are not CSS classes, are Tailwind classes, or are taken', async () => {
    const req = await asAdmin()
    const tailwind = await upsertClass(req, { name: 'flex', styles: 'p-2' })
    assert.equal(tailwind.ok, false)
    assert.match(!tailwind.ok ? tailwind.error : '', /Tailwind class/)
    const form = await upsertClass(req, { name: '1card' })
    assert.equal(form.ok, false)
    const created = await upsertClass(req, { name: 'card', label: 'Card', group: 'Surfaces', styles: 'rounded-xl  p-6 md:p-8 hover:shadow-lg' })
    assert.ok(created.ok && created.created)
    cardId = created.class.id
    assert.equal(created.class.styles, 'rounded-xl p-6 md:p-8 hover:shadow-lg', 'one space between classes')
    assert.equal(created.class.status, 'draft')
    await assert.rejects(payload.create({ collection: SLUG as never, data: { name: 'card' } as never, overrideAccess: true }), (error: Error & { data?: { errors?: Array<{ message: string }> } }) => {
      assert.match(error.data?.errors?.[0]?.message ?? '', /already exists/)
      return true
    })
  })

  it('compiles the published classes into one hashed stylesheet; drafts stay out', async () => {
    assert.equal((await loadClassesSheet(payload))?.css ?? '', '', 'a draft class is not on the site')
    const req = await asAdmin()
    assert.ok((await publishClass(req, cardId)).ok)
    const sheet = await loadClassesSheet(payload)
    assert.ok(sheet)
    assert.match(sheet.css, /\.card \{/)
    assert.match(sheet.css, /@media \(width >= 48rem\)/)
    assert.deepEqual(sheet.names, ['card'])
    assert.match(sheet.hash, /^[0-9a-f]{16}$/)

    // A draft edit changes nothing on the site.
    assert.ok((await upsertClass(req, { name: 'card', styles: 'p-1' })).ok)
    assert.equal((await loadClassesSheet(payload))?.hash, sheet.hash)

    // The route: the current hash is immutable; another one gets the current sheet, briefly cached.
    const endpoint = (payload.config.endpoints ?? []).find((e) => e.path === `${CLASSES_SHEET_PATH}/:file` && e.method === 'get')!
    const call = async (file: string) => {
      const r = await asAdmin()
      r.routeParams = { file }
      return endpoint.handler(r)
    }
    const exact = await call(`${sheet.hash}.css`)
    assert.equal(exact.headers.get('Cache-Control'), 'public, max-age=31536000, immutable')
    assert.equal(exact.headers.get('Content-Type'), 'text/css; charset=utf-8')
    assert.match(await exact.text(), /\.card \{/)
    assert.equal((await call('0000.css')).headers.get('Cache-Control'), 'public, max-age=60')
  })

  it('publishing a page publishes the classes it uses that have unpublished changes', async () => {
    const home = await createPage('Home', ['card md:card p-2', 'text-lg'])
    homeId = home.id
    const card = await cls(cardId, false)
    assert.equal(card._status, 'published')
    assert.equal(card.styles, 'p-1', 'the pending draft went live with the page')
    assert.match((await loadClassesSheet(payload))!.css, /\.card \{\s*padding: var\(--spacing\);/)
  })

  it('counts the blocks and pages that use a class (once per block, any variant)', async () => {
    const usage = await classUsage(await asAdmin(), ['card', 'nothing'])
    assert.equal(usage.card?.blocks, 1)
    assert.deepEqual(usage.card?.documents, [{ collection: 'pages', id: homeId, title: 'Home', blocks: 1 }])
    assert.deepEqual(usage.nothing, { blocks: 0, documents: [] })
  })

  it('renames a class in every layout; published pages keep working through the old name', async () => {
    const result = await renameClass(await asAdmin(), cardId, 'panel')
    assert.ok(result.ok, !result.ok ? result.error : '')
    assert.equal(result.replaced.documents, 1)
    assert.equal(result.replaced.blocks, 1)
    await flush()
    assert.deepEqual(classNames(await page(homeId, true)), ['panel md:panel p-2', 'text-lg'])
    assert.deepEqual(classNames(await page(homeId, false)), ['card md:card p-2', 'text-lg'], 'the published page is untouched')
    const published = await cls(cardId, false)
    assert.equal(published.name, 'panel')
    assert.deepEqual(published.previousNames, ['card'])
    const sheet = (await loadClassesSheet(payload))!
    assert.deepEqual(sheet.names, ['card', 'panel'])
    assert.match(sheet.css, /\.card \{/)
    assert.match(sheet.css, /\.panel \{/)
  })

  it('a rename publishes only the new name: pending style changes stay drafts', async () => {
    const req = await asAdmin()
    assert.ok((await upsertClass(req, { name: 'panel', styles: 'p-3' })).ok)
    const result = await renameClass(req, cardId, 'box')
    assert.ok(result.ok, !result.ok ? result.error : '')
    await flush()
    const published = await cls(cardId, false)
    const draft = await cls(cardId, true)
    assert.equal(published.name, 'box')
    assert.equal(published.styles, 'p-1')
    assert.equal(draft.name, 'box')
    assert.equal(draft.styles, 'p-3')
    assert.equal(draft._status, 'draft')
    assert.deepEqual(classNames(await page(homeId, true)), ['box md:box p-2', 'text-lg'])
  })

  it('refuses to delete a used class; deleteClass removes it from the blocks first', async () => {
    await assert.rejects(payload.delete({ collection: SLUG as never, id: cardId, overrideAccess: true }), /is used on 1 block on 1 page/)
    const req = await asAdmin()
    const refused = await deleteClass(req, cardId)
    assert.equal(refused.ok, false)
    assert.equal(!refused.ok && refused.status, 409)
    assert.equal(!refused.ok && refused.usage?.documents.length, 1)
    const done = await deleteClass(req, cardId, { removeFromBlocks: true })
    assert.ok(done.ok, !done.ok ? done.error : '')
    await flush()
    assert.deepEqual(classNames(await page(homeId, true)), ['p-2', 'text-lg'])
    assert.equal((await payload.find({ collection: SLUG as never, overrideAccess: true })).totalDocs, 0)
    assert.equal((await loadClassesSheet(payload))?.css ?? '', '')
  })

  it("imports the site's code @utility classes as published classes, once", async () => {
    const req = await asAdmin()
    const result = await importSiteClasses(req)
    assert.ok(result.ok, !result.ok ? result.error : '')
    const byName = Object.fromEntries(result.created.map((c) => [c.name, c]))
    assert.deepEqual(
      { label: byName['card-code']?.label, group: byName['card-code']?.group, styles: byName['card-code']?.styles, css: byName['card-code']?.css, status: byName['card-code']?.status },
      { label: 'Code card', group: 'Surfaces', styles: 'rounded-lg p-4', css: 'border: 1px solid red;', status: 'published' },
    )
    assert.equal(byName['plain-code']?.styles, 'flex gap-2')
    assert.equal(byName['plain-code']?.css, null)
    const sheet = (await loadClassesSheet(payload))!
    assert.match(sheet.css, /\.card-code \{[^}]*border: 1px solid red/)
    const again = await importSiteClasses(req)
    assert.ok(again.ok && again.created.length === 0 && again.skipped.length === 2)
  })

  it("leaves the classes out of each page's CSS: the classes stylesheet styles them", async () => {
    const layout = layoutOf(['card-code p-5', 'plain-code md:plain-code'])
    const css = (await compilePageCss(payload, [{ layout }])) ?? ''
    assert.match(css, /\.p-5/)
    assert.doesNotMatch(css, /card-code|plain-code|border: 1px solid red/)
    const saved = (await payload.create({ collection: 'pages', data: { title: 'Stored', layout, _status: 'published' } as never, overrideAccess: true })) as unknown as Record<string, unknown>
    const stored = (saved.layoutCss as { css?: string } | undefined)?.css ?? ''
    assert.match(stored, /\.p-5/)
    assert.doesNotMatch(stored, /card-code|plain-code/)
  })

  it('MCP tools list, read, create and refuse to delete a used class', async () => {
    const tools = Object.fromEntries(builderMcpTools({ blocks: [heading], collections: { pages: {} } }).map((t) => [t.name, t]))
    for (const name of ['listClasses', 'getClass', 'upsertClass', 'deleteClass']) assert.ok(tools[name], name)
    assert.equal(tools.deleteClass!.routing.action, 'delete')
    const req = await asAdmin()
    const run = async (name: string, args: Record<string, unknown>) => {
      const result = await tools[name]!.handler({ collection: SLUG, ...args }, req, {})
      return { error: result.isError === true, body: result.content[0]!.text }
    }
    const listed = await run('listClasses', {})
    assert.equal(listed.error, false)
    const list = JSON.parse(listed.body) as { classes: Array<{ name: string; usedBy: { blocks: number; pages: number } }> }
    assert.deepEqual(list.classes.find((c) => c.name === 'card-code')?.usedBy, { blocks: 1, pages: 1 })

    const made = await run('upsertClass', { name: 'tool-card', styles: 'p-4 md:p-6', css: 'outline: 2px solid;', publish: true })
    assert.equal(made.error, false, made.body)
    assert.match((await loadClassesSheet(payload))!.css, /\.tool-card \{/)
    const bad = await run('upsertClass', { name: 'shadow' })
    assert.equal(bad.error, true)

    const got = JSON.parse((await run('getClass', { name: 'card-code' })).body) as { usage: { blocks: number } }
    assert.equal(got.usage.blocks, 1)
    const refused = await run('deleteClass', { name: 'card-code' })
    assert.equal(refused.error, true)
    assert.match(refused.body, /usedOn/)

    // listBlocks shows the editable classes as site classes.
    const blocks = JSON.parse((await tools.listBlocks!.handler({ collection: 'pages' }, req, {})).content[0]!.text) as { siteClasses?: Array<{ name: string }> }
    assert.ok(blocks.siteClasses?.some((c) => c.name === 'tool-card'))
  })
})
