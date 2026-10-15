import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { resolveRegions } from '../../../core/regions'
import type { FieldEdit } from '../store'
import { createRegionsController } from './controller'

const regions = resolveRegions(
  'pages',
  [
    { name: 'title', type: 'text' },
    { name: 'cover', type: 'upload', relationTo: 'media' },
    { name: 'layout', type: 'json' },
  ],
  [{ name: 'header', label: 'Header', fields: ['title', 'cover'] }],
  { fields: new Set(['layout']) },
)
const access = { title: { read: true, update: true }, cover: { read: true, update: false } }

type Call = { url: string; method: string; body: unknown }
let calls: Call[] = []
let answers: Array<{ status: number; body: unknown }> = []
const realFetch = globalThis.fetch

beforeEach(() => {
  calls = []
  answers = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null })
    const answer = answers.shift() ?? { status: 200, body: { ok: true, values: { title: 'Hello', cover: 3 }, access, updatedAt: 't0' } }
    return new Response(JSON.stringify(answer.body), { status: answer.status })
  }) as typeof fetch
})
afterEach(() => {
  globalThis.fetch = realFetch
})

function setup(options: { settingsOpen?: boolean } = {}) {
  const recorded: FieldEdit[][] = []
  const warnings: string[] = []
  let refreshed = 0
  const controller = createRegionsController({
    regions,
    endpoint: '/api/builder/live/pages/5',
    locale: () => 'de',
    settingsOpen: () => options.settingsOpen ?? false,
    refreshFrame: () => {
      refreshed++
    },
    record: (edits) => recorded.push(edits),
    warn: (text) => warnings.push(text),
  })
  return { controller, recorded, warnings, refreshes: () => refreshed }
}

describe('regions in the editor', () => {
  it('loads the values and the access in the editor’s locale', async () => {
    const { controller } = setup()
    await controller.load()
    assert.equal(calls[0].url, '/api/builder/live/pages/5/regions?locale=de')
    assert.equal(controller.state.get().status, 'ready')
    assert.equal(controller.state.get().values?.title, 'Hello')
  })

  it('saves a change with the value it replaces, records one undo step and shows the frame again', async () => {
    const { controller, recorded, refreshes } = setup()
    await controller.load()
    answers.push({ status: 200, body: { ok: true, values: { title: 'New', cover: 3 }, updatedAt: 't1' } })
    assert.equal(await controller.write([{ path: 'title', value: 'New' }]), true)
    assert.deepEqual(calls[1], { url: '/api/builder/live/pages/5/fields', method: 'POST', body: { changes: [{ path: 'title', value: 'New', base: 'Hello' }], locale: 'de' } })
    assert.deepEqual(recorded, [[{ path: 'title', before: 'Hello', after: 'New' }]])
    assert.equal(controller.state.get().values?.title, 'New')
    assert.equal(refreshes(), 1)
  })

  it('saves nothing when nothing changed, and treats empty text as no value', async () => {
    const { controller, recorded } = setup()
    answers.push({ status: 200, body: { ok: true, values: { title: null }, access, updatedAt: 't0' } })
    await controller.load()
    assert.equal(await controller.write([{ path: 'title', value: '' }]), true)
    assert.equal(calls.length, 1)
    assert.equal(recorded.length, 0)
  })

  it('says why and shows the stored value again when the server refuses', async () => {
    const { controller, recorded, warnings, refreshes } = setup()
    await controller.load()
    answers.push({ status: 409, body: { ok: false, error: 'Not saved: someone else changed Title a moment ago.', conflicts: [{ path: 'title', value: 'Theirs' }] } })
    assert.equal(await controller.write([{ path: 'title', value: 'Mine' }]), false)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(warnings, ['Not saved: someone else changed Title a moment ago.'])
    assert.equal(recorded.length, 0)
    assert.equal(calls.at(-1)?.url, '/api/builder/live/pages/5/regions?locale=de', 'it loads the stored values again')
    assert.equal(refreshes(), 1)
  })

  it('refuses fields the user may not change, and every field while the settings drawer is open', async () => {
    const { controller, warnings } = setup()
    assert.match(controller.lockedMessage('title') ?? '', /still loading/)
    await controller.load()
    assert.equal(controller.lockedMessage('title'), null)
    assert.equal(controller.lockedMessage('cover'), 'You may not change Cover.')
    assert.equal(await controller.write([{ path: 'cover', value: 4 }]), false)
    assert.deepEqual(warnings, ['You may not change Cover.'])
    assert.equal(calls.length, 1)
    const open = setup({ settingsOpen: true })
    await open.controller.load()
    assert.match(open.controller.lockedMessage('title') ?? '', /Close the page settings/)
  })

  it('undoes through `writeEdits` with the expected value as `base`', async () => {
    const { controller } = setup()
    await controller.load()
    await controller.writeEdits([{ path: 'title', value: 'Hello', base: 'New' }], 'de')
    assert.deepEqual(calls[1].body, { changes: [{ path: 'title', value: 'Hello', base: 'New' }], locale: 'de' })
  })

  it('shows saves by others: the frame for any other field, the values too for a region field', async () => {
    const { controller, refreshes } = setup()
    await controller.load()
    controller.handleEvent({ type: 'saved', seq: 1, at: 'x' })
    assert.equal(refreshes(), 0, 'a layout-only save changes nothing outside the layout')
    controller.handleEvent({ type: 'saved', seq: 1, at: 'x', fields: ['slug'] })
    assert.equal(refreshes(), 1)
    assert.equal(calls.length, 1, 'no reload for a field no region shows')
    controller.handleEvent({ type: 'saved', seq: 1, at: 'x', fields: ['title'] })
    assert.equal(refreshes(), 2)
    assert.equal(calls.length, 2)
    controller.handleEvent({ type: 'published', action: 'revert', status: 'published', at: 'x', actor: { type: 'user', id: 'u', label: 'U' } })
    assert.equal(refreshes(), 3)
  })

  it('skips the saved event of its own save', async () => {
    const { controller, refreshes } = setup()
    await controller.load()
    answers.push({ status: 200, body: { ok: true, values: { title: 'New', cover: 3 }, updatedAt: 't1' } })
    await controller.write([{ path: 'title', value: 'New' }])
    controller.handleEvent({ type: 'saved', seq: 1, at: 'x', updatedAt: 't1', fields: ['title'] })
    assert.equal(refreshes(), 1)
  })
})

/**
 * A stateful fields endpoint: the title per locale, Payload's base check, and an optional hook
 * that trims the value (as a field's beforeChange hook would).
 */
function fakeServer(titles: Record<string, string>, options: { trim?: boolean } = {}) {
  const posts: Array<{ changes: Array<{ path: string; value: unknown; base?: unknown }>; locale: string }> = []
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const locale = init?.body ? (JSON.parse(String(init.body)) as { locale: string }).locale : (new URL(url, 'http://x').searchParams.get('locale') ?? 'en')
    if (!init?.body) return new Response(JSON.stringify({ ok: true, values: { title: titles[locale] }, access, updatedAt: 't' }))
    const body = JSON.parse(String(init.body)) as (typeof posts)[number]
    posts.push(body)
    for (const change of body.changes) {
      if ('base' in change && change.base !== titles[locale] && change.value !== titles[locale]) {
        return new Response(JSON.stringify({ ok: false, error: 'Not saved: someone else changed Title a moment ago.', conflicts: [{ path: 'title', value: titles[locale] }] }), { status: 409 })
      }
    }
    for (const change of body.changes) titles[locale] = options.trim ? String(change.value).trim() : String(change.value)
    return new Response(JSON.stringify({ ok: true, values: { title: titles[locale] }, updatedAt: `t${posts.length}` }))
  }) as typeof fetch
  return posts
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5))

async function editorWith(titles: Record<string, string>, options: { trim?: boolean } = {}) {
  const posts = fakeServer(titles, options)
  const { createEditorStore } = await import('../store')
  const store = createEditorStore({ version: 1, blocks: [] })
  let locale = 'en'
  const warnings: string[] = []
  const controller = createRegionsController({
    regions,
    endpoint: '/api/builder/live/pages/5',
    locale: () => locale,
    settingsOpen: () => false,
    refreshFrame: () => {},
    record: (edits, at) => store.recordFields(edits, at),
    warn: (text) => warnings.push(text),
  })
  store.setFieldWriter((changes, at) => controller.writeEdits(changes, at))
  await controller.load()
  return { store, controller, posts, warnings, setLocale: (next: string) => (locale = next) }
}

describe('region history', () => {
  it('undoes a step in the locale it was made in, even when another locale holds the same value', async () => {
    // English becomes "New", which French already says. Undo after switching to French must touch English only.
    const titles = { en: 'Old', fr: 'New' }
    const { store, controller, posts, setLocale } = await editorWith(titles)
    await controller.write([{ path: 'title', value: 'New' }])
    assert.deepEqual(titles, { en: 'New', fr: 'New' })
    setLocale('fr')
    await controller.load()
    store.undo()
    await settle()
    assert.deepEqual(posts.at(-1), { changes: [{ path: 'title', value: 'Old', base: 'New' }], locale: 'en' })
    assert.deepEqual(titles, { en: 'Old', fr: 'New' }, 'French is untouched')
    // The answer is English: the French values on screen stay.
    await settle()
    assert.equal(controller.state.get().values?.title, 'New')
    store.redo()
    await settle()
    assert.deepEqual(titles, { en: 'New', fr: 'New' })
    assert.equal(posts.at(-1)?.locale, 'en')
  })

  it('records the value the server stored after its hooks, so undo and redo still match it', async () => {
    const titles = { en: 'Old' }
    const { store, controller, posts, warnings } = await editorWith(titles, { trim: true })
    await controller.write([{ path: 'title', value: '  New  ' }])
    assert.equal(titles.en, 'New')
    store.undo()
    await settle()
    assert.deepEqual(posts.at(-1)?.changes, [{ path: 'title', value: 'Old', base: 'New' }])
    assert.equal(titles.en, 'Old')
    assert.equal(store.getState().redoStack.length, 1, 'the step was not dropped')
    store.redo()
    await settle()
    assert.equal(titles.en, 'New')
    assert.deepEqual(warnings, [])
  })

  it('keeps the base of an inline edit from its start: a save by someone else meanwhile is a conflict, never overwritten', async () => {
    const titles = { en: 'Old' }
    const { store, controller, posts, warnings } = await editorWith(titles)
    const { applyInlineChange, endRegionInline, noteInlineStart } = await import('../inline')
    const runtime = { regions: controller, store } as never
    // Editor A starts typing in the title it sees: "Old".
    noteInlineStart(runtime, { session: 's1', id: '', path: 'title', region: 'header', base: 'Old' })
    // Editor B saves "Other"; A's editor hears of it and loads the new value while A still types.
    titles.en = 'Other'
    await controller.load()
    assert.equal(controller.state.get().values?.title, 'Other')
    applyInlineChange(runtime, { session: 's1', id: '', path: 'title', value: 'Mine', region: 'header' })
    endRegionInline(runtime, { session: 's1' })
    await settle()
    assert.deepEqual(posts.at(-1)?.changes, [{ path: 'title', value: 'Mine', base: 'Old' }])
    assert.equal(titles.en, 'Other', 'B’s change stays')
    assert.match(warnings[0] ?? '', /someone else changed Title/)
    assert.equal(store.getState().undoStack.length, 0)
  })

  it('saves nothing for an inline session that changed nothing', async () => {
    const titles = { en: 'Old' }
    const { store, controller, posts } = await editorWith(titles)
    const { endRegionInline, noteInlineStart } = await import('../inline')
    const runtime = { regions: controller, store } as never
    noteInlineStart(runtime, { session: 's2', id: '', path: 'title', region: 'header', base: 'Old' })
    endRegionInline(runtime, { session: 's2' })
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(posts.length, 0)
  })
})
