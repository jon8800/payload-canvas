import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { formFieldType } from '../forms/blocks'
import { FORM_BLOCK, FORM_SLOT, FORM_SUBMIT_BLOCK } from '../forms/pageForms'
import type { Block, Layout } from '../core/types'
import { claimForm, pageFormSync, withoutVirtualFields } from './formsSync'

type Doc = Record<string, unknown> & { id: number }

/** A forms collection in memory: `find` by source, `create`, `update`, `findByID`. */
function fakeRequest(initial: Doc[] = []) {
  const docs = new Map(initial.map((d) => [d.id, structuredClone(d)]))
  let next = 100
  const calls: string[] = []
  const matches = (doc: Doc, where: { and: Array<Record<string, { equals?: unknown; in?: unknown[] }>> }) =>
    where.and.every((clause) => {
      const [path, test] = Object.entries(clause)[0]!
      const value = path.split('.').reduce<unknown>((v, key) => (v as Record<string, unknown> | undefined)?.[key], doc)
      return test.in ? test.in.includes(value) : value === test.equals
    })
  const payload = {
    collections: { pages: { config: { admin: { useAsTitle: 'title' } } } },
    find: async ({ where }: { where: never }) => ({ docs: [...docs.values()].filter((d) => matches(d, where)) }),
    findByID: async ({ id }: { id: number }) => {
      const doc = docs.get(Number(id))
      if (!doc) throw new Error('not found')
      return doc
    },
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const doc = { ...data, id: next++ } as Doc
      docs.set(doc.id, doc)
      calls.push(`create ${doc.id}`)
      return doc
    },
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const doc = { ...docs.get(Number(id))!, ...data } as Doc
      docs.set(doc.id, doc)
      calls.push(`update ${id}`)
      return doc
    },
  }
  return { req: { payload } as unknown as PayloadRequest, docs, calls }
}

const field = (id: string, name: string): Block => ({ id, type: formFieldType('text'), props: { name, label: name } })
const form = (id: string, children: Block[]): Block => ({ id, type: FORM_BLOCK, props: { mode: 'build' }, slots: { [FORM_SLOT]: [...children, { id: `${id}-s`, type: FORM_SUBMIT_BLOCK }] } })
const sync = pageFormSync({ collection: 'pages', layoutField: 'layout', forms: 'forms', settings: ['title', 'submitButtonLabel', 'emails'] })

describe('pageFormSync', () => {
  it('creates a form for a new Form block, remembers its block, and stores the id', async () => {
    const { req, docs, calls } = fakeRequest()
    const layout: Layout = { version: 1, blocks: [form('f1', [field('a', 'name')])] }
    const out = await sync(layout, { req, id: 12, data: { title: 'Contact' }, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100'])
    assert.equal(out.blocks[0]?.props?.form, 100)
    const doc = docs.get(100)!
    const { hash, ...source } = doc.source as Record<string, unknown>
    assert.deepEqual(source, { collection: 'pages', document: '12', block: 'f1' })
    assert.equal(typeof hash, 'string')
    assert.equal(doc.title, 'Contact form')
    assert.deepEqual((doc.fields as Array<{ name: string }>).map((f) => f.name), ['name'])
  })

  it('updates the form of its block only when something changed, and a copied block gets its own', async () => {
    const { req, calls } = fakeRequest()
    const first: Layout = { version: 1, blocks: [form('f1', [field('a', 'name')])] }
    const saved = await sync(first, { req, id: 12, data: { title: 'Contact' }, originalDoc: undefined })
    // Publishing again without changes writes nothing.
    await sync(saved, { req, id: 12, data: { title: 'Contact' }, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100'])
    // The copy keeps `form: 100` from the original, but its block id differs: a new form.
    const copy = { ...structuredClone(saved.blocks[0]!), id: 'f2' }
    const changed: Layout = { version: 1, blocks: [{ ...saved.blocks[0]!, slots: { [FORM_SLOT]: [field('a', 'full_name')] } }, copy] }
    const out = await sync(changed, { req, id: 12, data: { title: 'Contact' }, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100', 'update 100', 'create 101'])
    assert.deepEqual(out.blocks.map((b) => b.props?.form), [100, 101])
  })

  it('gives a copied page its own forms', async () => {
    const { req, calls } = fakeRequest()
    const layout: Layout = { version: 1, blocks: [form('f1', [field('a', 'name')])] }
    const saved = await sync(layout, { req, id: 12, data: {}, originalDoc: undefined })
    const copied = await sync(saved, { req, id: 13, data: {}, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100', 'create 101'])
    assert.equal(copied.blocks[0]?.props?.form, 101)
  })
})

describe('claimForm', () => {
  const source = { collection: 'pages', document: '12', block: 'f1' }

  it('keeps the id of a form no other page uses', async () => {
    const { req, docs } = fakeRequest([{ id: 15, title: 'Contact form' }])
    const result = await claimForm(req, { forms: 'forms', formId: 15, source, usage: async () => [{ collection: 'pages', id: 12 }] })
    assert.equal(result.ok && result.kept, true)
    assert.deepEqual(docs.get(15)?.source, source)
  })

  it('leaves a form that other pages use, or that another block owns', async () => {
    const { req, docs } = fakeRequest([{ id: 15, title: 'Contact form' }, { id: 16, source: { collection: 'pages', document: '9', block: 'x' } }])
    const used = await claimForm(req, { forms: 'forms', formId: 15, source, usage: async () => [{ collection: 'pages', id: 30 }] })
    assert.equal(used.ok && used.kept, false)
    assert.equal(docs.get(15)?.source, undefined)
    const owned = await claimForm(req, { forms: 'forms', formId: 16, source, usage: async () => [] })
    assert.equal(owned.ok && owned.kept, false)
    const missing = await claimForm(req, { forms: 'forms', formId: 99, source, usage: async () => [] })
    assert.equal(missing.ok, false)
  })
})

describe('withoutVirtualFields', () => {
  it('leaves out the values Payload computes on read, also inside groups', () => {
    const fields = [
      { name: 'title', type: 'text' },
      { name: 'spamProtection', type: 'group', fields: [{ name: 'honeypot', type: 'checkbox' }, { name: 'turnstileSiteKey', type: 'text', virtual: true }] },
    ] as never
    assert.deepEqual(withoutVirtualFields({ title: 'A', spamProtection: { honeypot: true, turnstileSiteKey: 'x' } }, fields), { title: 'A', spamProtection: { honeypot: true } })
  })
})
