import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import type { PayloadRequest } from 'payload'

import { formFieldType } from '../forms/blocks'
import { FORM_BLOCK, FORM_SLOT, FORM_SUBMIT_BLOCK } from '../forms/pageForms'
import type { Block, Layout } from '../core/types'
import { withoutVirtualFields } from '../forms/pageSync'
import { claimForm, FORM_GONE_MESSAGE, formLiveCheck, formSourceLive, hasLocalizedField, pageFormSync, type FormUsage } from './formsSync'

type Doc = Record<string, unknown> & { id: number }

type FakeOptions = { localization?: unknown; formFields?: unknown[]; pages?: Doc[] }

/** A forms collection (and a pages collection) in memory: `find` by source, `create`, `update`, `findByID`. */
function fakeRequest(initial: Doc[] = [], extra: FakeOptions = {}) {
  const docs = new Map(initial.map((d) => [d.id, structuredClone(d)]))
  const pages = new Map((extra.pages ?? []).map((d) => [d.id, d]))
  let next = 100
  const calls: string[] = []
  const args: Array<Record<string, unknown>> = []
  const matches = (doc: Doc, where: { and: Array<Record<string, { equals?: unknown; in?: unknown[] }>> }) =>
    where.and.every((clause) => {
      const [path, test] = Object.entries(clause)[0]!
      const value = path.split('.').reduce<unknown>((v, key) => (v as Record<string, unknown> | undefined)?.[key], doc)
      return test.in ? test.in.includes(value) : value === test.equals
    })
  const payload = {
    config: { localization: extra.localization },
    collections: {
      pages: { config: { admin: { useAsTitle: 'title' }, versions: { drafts: true } } },
      forms: { config: { fields: extra.formFields ?? [] } },
    },
    find: async ({ where }: { where: never }) => ({ docs: [...docs.values()].filter((d) => matches(d, where)) }),
    findByID: async (input: { id: number; collection: string }) => {
      args.push(input)
      const doc = input.collection === 'pages' ? pages.get(Number(input.id)) : docs.get(Number(input.id))
      if (!doc) throw new Error('not found')
      return doc
    },
    create: async (input: { data: Record<string, unknown>; locale?: string }) => {
      const doc = { ...input.data, id: next++ } as Doc
      docs.set(doc.id, doc)
      calls.push(`create ${doc.id}${input.locale ? ` ${input.locale}` : ''}`)
      args.push(input)
      return doc
    },
    update: async (input: { id: number; data: Record<string, unknown>; locale?: string }) => {
      const doc = { ...docs.get(Number(input.id))!, ...input.data } as Doc
      docs.set(doc.id, doc)
      calls.push(`update ${input.id}${input.locale ? ` ${input.locale}` : ''}`)
      args.push(input)
      return doc
    },
  }
  return { req: { payload } as unknown as PayloadRequest, docs, calls, args }
}

const field = (id: string, name: string): Block => ({ id, type: formFieldType('text'), props: { name, label: name } })
const form = (id: string, children: Block[]): Block => ({ id, type: FORM_BLOCK, props: { mode: 'build' }, slots: { [FORM_SLOT]: [...children, { id: `${id}-s`, type: FORM_SUBMIT_BLOCK }] } })
const settings = ['title', 'submitButtonLabel', 'emails']
const unused: FormUsage = async () => []
const syncWith = (usage: FormUsage) => pageFormSync({ collection: 'pages', layoutField: 'layout', forms: 'forms', settings, usage })
const sync = syncWith(unused)

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

/** A Form block that names a form, as "Move into this page" leaves it. */
const moved = (formId: number): Layout => ({ version: 1, blocks: [{ ...form('f1', [field('a', 'name')]), props: { mode: 'build', form: formId } }] })

/** A Form block with German values. */
const translated = (): Layout => ({
  version: 1,
  blocks: [
    {
      ...form('f1', [{ ...field('a', 'name'), props: { name: 'name', label: 'Name' }, locales: { de: { label: 'Vorname' } } }]),
      props: { mode: 'build', title: 'Contact' },
      locales: { de: { title: 'Kontakt' } },
    },
  ],
})

describe('pageFormSync: taking over a moved form', () => {
  it('takes over the form "Move into this page" named, on publish: the id and its submissions stay', async () => {
    const { req, docs, calls } = fakeRequest([{ id: 15, title: 'Contact form' }])
    const out = await sync(moved(15), { req, id: 12, data: {}, originalDoc: undefined })
    assert.deepEqual(calls, ['update 15'])
    assert.equal(out.blocks[0]?.props?.form, 15)
    assert.equal((docs.get(15)?.source as { block?: string } | undefined)?.block, 'f1')
  })

  it('copies a form another page uses, another block owns, or whose usage is unknown, and never takes one over on create', async () => {
    const { req, calls } = fakeRequest([{ id: 15, title: 'Contact form' }, { id: 16, source: { collection: 'pages', document: '9', block: 'x' } }])
    const run = (s: ReturnType<typeof syncWith>, formId: number, id: number, create?: boolean) =>
      s(moved(formId), { req, id, data: {}, originalDoc: undefined, create }).then((out) => out.blocks[0]?.props?.form)
    assert.equal(await run(syncWith(async () => [{ collection: 'pages', id: 30 }]), 15, 12), 100)
    // Without the references index (references: false) usage is unknown: a copy.
    assert.equal(await run(syncWith(async () => null), 15, 14), 101)
    // A copied page (collection without drafts) keeps the original's form id: a create never takes it over.
    assert.equal(await run(sync, 15, 13, true), 102)
    assert.equal(await run(sync, 16, 15), 103)
    assert.deepEqual(calls, ['create 100', 'create 101', 'create 102', 'create 103'])
  })
})

describe('pageFormSync: locales', () => {
  const localization = { locales: ['en', 'de'], defaultLocale: 'en', fallback: true }

  it('writes the default locale explicitly when the forms collection is not localized', async () => {
    const { req, docs, calls } = fakeRequest([], { localization })
    await sync(translated(), { req, id: 12, data: {}, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100 en'])
    assert.equal(docs.get(100)?.title, 'Contact')
  })

  it('writes each locale when the forms collection has localized fields, and nothing when no locale changed', async () => {
    const { req, calls, args } = fakeRequest([], { localization, formFields: [{ name: 'title', type: 'text', localized: true }] })
    const saved = await sync(translated(), { req, id: 12, data: {}, originalDoc: undefined })
    assert.deepEqual(calls, ['create 100 en', 'update 100 de'])
    const de = args.at(-1)!.data as { title: string; fields: Array<{ label: string }> }
    assert.equal(de.title, 'Kontakt')
    assert.equal(de.fields[0]?.label, 'Vorname')
    await sync(saved, { req, id: 12, data: {}, originalDoc: undefined })
    assert.equal(calls.length, 2)
  })

  it('finds localized fields at any depth', () => {
    assert.equal(hasLocalizedField([{ name: 'fields', type: 'blocks', blocks: [{ slug: 'text', fields: [{ name: 'label', type: 'text', localized: true }] }] }]), true)
    assert.equal(hasLocalizedField([{ name: 'title', type: 'text' }]), false)
  })
})

describe('claimForm', () => {
  const source = { collection: 'pages', document: '12', block: 'f1' }

  it('keeps the id of a form no other page uses, reads it with the user\'s access, and writes nothing', async () => {
    const { req, docs, calls, args } = fakeRequest([{ id: 15, title: 'Contact form' }])
    const result = await claimForm(req, { forms: 'forms', formId: 15, source, usage: async () => [{ collection: 'pages', id: 12 }] })
    assert.equal(result.ok && result.kept, true)
    assert.equal(args[0]?.overrideAccess, false)
    // The publish takes the form over: an undo or an unsaved page leaves it as it was.
    assert.equal(docs.get(15)?.source, undefined)
    assert.deepEqual(calls, [])
  })

  it('copies a form that other pages use, that another block owns, or whose usage is unknown', async () => {
    const { req } = fakeRequest([{ id: 15, title: 'Contact form' }, { id: 16, source: { collection: 'pages', document: '9', block: 'x' } }])
    const used = await claimForm(req, { forms: 'forms', formId: 15, source, usage: async () => [{ collection: 'pages', id: 30 }] })
    assert.equal(used.ok && used.kept, false)
    const owned = await claimForm(req, { forms: 'forms', formId: 16, source, usage: unused })
    assert.equal(owned.ok && owned.kept, false)
    // Without the references index (references: false) the claim never keeps the id.
    const unknown = await claimForm(req, { forms: 'forms', formId: 15, source, usage: async () => null })
    assert.equal(unknown.ok && unknown.kept, false)
    const missing = await claimForm(req, { forms: 'forms', formId: 99, source, usage: unused })
    assert.equal(missing.ok, false)
  })
})

describe('formLiveCheck', () => {
  const layoutField = { field: 'layout', blocks: 'layout' } as const
  const sectionField = { field: 'blocks', blocks: 'list' } as const
  const page: Doc = { id: 12, _status: 'published', layout: { version: 1, blocks: [{ id: 'wrap', type: 'stack', slots: { children: [form('f1', [field('a', 'name')])] } }] } }

  it('tells whether the page or section still shows the form', () => {
    assert.equal(formSourceLive(page, { block: 'f1' }, { drafts: true, field: layoutField }), true)
    assert.equal(formSourceLive({ ...page, _status: 'draft' }, { block: 'f1' }, { drafts: true, field: layoutField }), false)
    assert.equal(formSourceLive({ ...page, layout: { version: 1, blocks: [] } }, { block: 'f1' }, { drafts: true, field: layoutField }), false)
    assert.equal(formSourceLive(null, { block: 'f1' }, { drafts: true, field: layoutField }), false)
    // A saved section: no drafts, its blocks are a list.
    assert.equal(formSourceLive({ id: 3, blocks: [form('f9', [])] }, { block: 'f9' }, { drafts: false, field: sectionField }), true)
    assert.equal(formSourceLive({ id: 3, blocks: [] }, { block: 'f9' }, { drafts: false, field: sectionField }), false)
  })

  it('refuses a submission to a removed page form, and leaves forms made in the Forms collection alone', async () => {
    const forms: Doc[] = [
      { id: 15, source: { collection: 'pages', document: '12', block: 'f1' } },
      { id: 16, source: { collection: 'pages', document: '12', block: 'gone' } },
      { id: 18, source: { collection: 'pages', document: '99', block: 'f1' } },
      { id: 17, title: 'Made in Forms' },
    ]
    const { req, args } = fakeRequest(forms, { pages: [page] })
    const check = formLiveCheck({ forms: 'forms', sourceField: (slug) => (slug === 'pages' ? layoutField : null) })
    const run = (formId: number) => (check as unknown as (a: Record<string, unknown>) => Promise<unknown>)({ data: { form: formId }, operation: 'create', req })
    assert.deepEqual(await run(15), { form: 15 })
    // The published document, two cheap reads by id.
    assert.deepEqual(args.slice(-2).map((a) => [a.collection, a.draft]), [['forms', undefined], ['pages', false]])
    assert.deepEqual(await run(17), { form: 17 })
    await assert.rejects(run(16), (error: Error) => error.message === FORM_GONE_MESSAGE)
    // A deleted page.
    await assert.rejects(run(18), (error: Error) => error.message === FORM_GONE_MESSAGE)
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
