// "Default template": one published default per collection, set on Publish only, never by
// publishing another template's draft (QA B1), and never empty (QA M13).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { keepOneDefault, requireBlocksForDefault } from './templates'

type Doc = Record<string, unknown>
type Version = { data: Doc; status: 'draft' | 'published' }

const LAYOUT = { version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Hi' } }] }

/**
 * A tiny draft-aware store: `main` holds the published state (Payload's collection table),
 * `versions` the history. `update` with `draft: true` adds a draft version only.
 */
function fakePayload(initial: Record<string, { main: Doc; versions: Version[] }>) {
  const docs = structuredClone(initial)
  const calls: Array<{ id: unknown; draft: boolean; data: Doc; context: Doc }> = []
  const payload = {
    async find({ where }: { where: { and: Array<Record<string, { equals?: unknown; not_equals?: unknown }>> } }) {
      const match = (doc: Doc) =>
        where.and.every((clause) => {
          const [key, cond] = Object.entries(clause)[0]
          if ('equals' in cond) return doc[key] === cond.equals
          return doc[key] !== cond.not_equals
        })
      return { docs: Object.values(docs).map((d) => structuredClone(d.main)).filter(match) }
    },
    async findByID({ id, draft }: { id: string; draft?: boolean }) {
      const entry = docs[id]
      const latest = entry.versions.at(-1)
      return structuredClone(draft && latest ? { ...latest.data, _status: latest.status } : entry.main)
    },
    async update({ id, data, draft, context }: { id: string; data: Doc; draft: boolean; context: Doc }) {
      calls.push({ id, draft, data, context })
      const entry = docs[id]
      const latest = entry.versions.at(-1)?.data ?? entry.main
      const next = { ...latest, ...data, id }
      if (draft) {
        entry.versions.push({ data: { ...next, _status: 'draft' }, status: 'draft' })
      } else {
        entry.main = { ...next, _status: 'published' }
        entry.versions.push({ data: entry.main, status: 'published' })
      }
      return next
    },
  }
  return { docs, calls, req: { payload, context: {}, t: (key: string) => key } }
}

const published = (id: string, extra: Doc = {}): Doc => ({
  id,
  name: `Template ${id}`,
  targetCollection: 'posts',
  isDefault: true,
  layout: LAYOUT,
  previewDocument: 20,
  _status: 'published',
  ...extra,
})

const run = (hook: typeof keepOneDefault, req: unknown, doc: Doc, context: Doc = {}) =>
  hook({ collection: { slug: 'builder-templates' }, context, doc, req, operation: 'update', previousDoc: {} } as never)

describe('keepOneDefault', () => {
  it('does nothing on draft saves: ticking Default takes effect on Publish', async () => {
    const { req, calls } = fakePayload({ '6': { main: published('6'), versions: [] } })
    await run(keepOneDefault, req, { id: '7', targetCollection: 'posts', isDefault: true, _status: 'draft' })
    assert.equal(calls.length, 0)
  })

  it('clears the old default on publish without publishing its unpublished draft', async () => {
    const old = published('6')
    const draft = { ...old, layout: { version: 1, blocks: [] }, previewDocument: 19, _status: 'draft' }
    const { req, docs, calls } = fakePayload({
      '6': { main: old, versions: [{ data: old, status: 'published' }, { data: draft, status: 'draft' }] },
    })
    await run(keepOneDefault, req, { id: '7', targetCollection: 'posts', isDefault: true, _status: 'published' })

    // The published version keeps its own layout and sample document; only the flag changes.
    assert.equal(docs['6'].main.isDefault, false)
    assert.deepEqual(docs['6'].main.layout, LAYOUT)
    assert.equal(docs['6'].main.previewDocument, 20)
    // The unpublished draft is still the newest version, still a draft, with the flag off too.
    const latest = docs['6'].versions.at(-1)!
    assert.equal(latest.status, 'draft')
    assert.deepEqual(latest.data.layout, { version: 1, blocks: [] })
    assert.equal(latest.data.previewDocument, 19)
    assert.equal(latest.data.isDefault, false)
    // The publish keeps the published layout exactly (the session guard stays out of it).
    assert.equal(calls[0].context.builderKeepLayout, true)
    assert.equal(calls[1].context.builderKeepLayout, undefined)
  })

  it('leaves templates of other collections and never-published templates alone', async () => {
    const { req, calls } = fakePayload({
      '1': { main: published('1', { targetCollection: 'pages' }), versions: [] },
      '2': { main: published('2', { _status: 'draft' }), versions: [] },
    })
    await run(keepOneDefault, req, { id: '7', targetCollection: 'posts', isDefault: true, _status: 'published' })
    assert.equal(calls.length, 0)
  })

  it('ignores its own saves', async () => {
    const { req, calls } = fakePayload({ '6': { main: published('6'), versions: [] } })
    await run(keepOneDefault, req, { id: '7', targetCollection: 'posts', isDefault: true, _status: 'published' }, { builderTemplateDefault: true })
    assert.equal(calls.length, 0)
  })
})

const check = (data: Doc, originalDoc: Doc = {}) =>
  requireBlocksForDefault({ data, originalDoc, req: { t: (k: string) => k }, operation: 'update', context: {} } as never)

describe('requireBlocksForDefault', () => {

  it('refuses to publish an empty default template, with a clear message', () => {
    assert.throws(
      () => check({ _status: 'published', isDefault: true, layout: { version: 1, blocks: [] } }),
      (error: { data?: { errors?: Array<{ path: string; message: string }> } }) =>
        error.data?.errors?.[0]?.path === 'isDefault' && /needs at least one block/.test(error.data.errors[0].message),
    )
  })
  it('reads the stored layout when the publish sends only the status', () => {
    assert.throws(() => check({ _status: 'published' }, { isDefault: true, layout: null }))
    assert.doesNotThrow(() => check({ _status: 'published' }, { isDefault: true, layout: LAYOUT }))
  })
  it('allows empty drafts and empty non-default templates', () => {
    assert.doesNotThrow(() => check({ _status: 'draft', isDefault: true, layout: { version: 1, blocks: [] } }))
    assert.doesNotThrow(() => check({ _status: 'published', isDefault: false, layout: { version: 1, blocks: [] } }))
  })
})
