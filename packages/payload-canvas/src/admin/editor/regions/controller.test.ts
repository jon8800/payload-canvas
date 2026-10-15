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
    record: (edits, _locale, saved) => {
      recorded.push(edits)
      void saved.then((stored) => {
        const index = recorded.indexOf(edits)
        if (stored) recorded[index] = stored
        else recorded.splice(index, 1)
      })
    },
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
  let refreshed = 0
  const warnings: string[] = []
  const controller = createRegionsController({
    regions,
    endpoint: '/api/builder/live/pages/5',
    locale: () => locale,
    settingsOpen: () => false,
    refreshFrame: () => { refreshed++ },
    record: (edits, at, saved) => store.recordFields(edits, at, saved),
    warn: (text) => warnings.push(text),
  })
  store.setFieldWriter((changes, at) => controller.writeEdits(changes, at))
  await controller.load()
  return { store, controller, posts, warnings, refreshes: () => refreshed, setLocale: (next: string) => (locale = next) }
}

describe('region history', () => {
  it('does not clear redo for unchanged text or hide a pending edit behind a repeated blur', async () => {
    const titles = { en: 'Old' }
    const { store, controller, refreshes } = await editorWith(titles)
    await controller.write([{ path: 'title', value: 'One' }])
    store.undo()
    await settle()
    assert.equal(store.getState().redoStack.length, 1)
    await controller.write([{ path: 'title', value: 'Old' }])
    assert.equal(store.getState().redoStack.length, 1)
    const before = refreshes()
    const first = controller.write([{ path: 'title', value: 'Two' }])
    const repeated = controller.write([{ path: 'title', value: 'Two' }])
    assert.equal(refreshes(), before, 'a duplicate blur cannot refresh an old frame while its save is queued')
    assert.equal(store.getState().undoStack.length, 1)
    store.undo()
    await Promise.all([first, repeated])
    await settle()
    assert.equal(titles.en, 'Old')
  })

  it('saves two rapid image choices with the preceding choice as each base', async () => {
    const { store, controller, warnings } = await editorWith({ en: 'Old' })
    let cover = 3
    const bases: number[] = []
    globalThis.fetch = (async (_url, init) => {
      if (init?.body) {
        const body = JSON.parse(String(init.body)) as { changes: Array<{ path: string; base: number; value: number }> }
        assert.equal(body.changes[0].path, 'cover')
        assert.equal(body.changes[0].base, cover)
        bases.push(body.changes[0].base)
        cover = body.changes[0].value
      }
      return new Response(JSON.stringify({ ok: true, values: { title: 'Old', cover }, storedValues: { title: 'Old', cover }, access: { ...access, cover: { read: true, update: true } }, updatedAt: 't' }))
    }) as typeof fetch
    await controller.load()
    const first = controller.write([{ path: 'cover', value: 4 }])
    const second = controller.write([{ path: 'cover', value: 5 }])
    assert.deepEqual(await Promise.all([first, second]), [true, true])
    assert.equal(cover, 5)
    assert.deepEqual(bases, [3, 4])
    store.undo()
    await settle()
    assert.equal(cover, 4)
    assert.deepEqual(warnings, [])
  })

  for (const next of ['Two', 'Old']) {
    it(`queues edits without explicit bases, including a return to ${next}`, async () => {
      const titles = { en: 'Old' }
      const { store, controller, posts, warnings } = await editorWith(titles)
      const first = controller.write([{ path: 'title', value: 'One' }])
      const second = controller.write([{ path: 'title', value: next }])
      assert.deepEqual(await Promise.all([first, second]), [true, true])
      assert.equal(titles.en, next)
      assert.deepEqual(posts.map((post) => post.changes[0].base), ['Old', 'One'])
      store.undo()
      await settle()
      assert.equal(titles.en, 'One')
      store.redo()
      await settle()
      assert.equal(titles.en, next)
      assert.deepEqual(warnings, [])
    })
  }

  it('preserves an explicit base when another queued write has changed that field', async () => {
    const titles = { en: 'Old' }
    const { controller, warnings } = await editorWith(titles)
    const first = controller.write([{ path: 'title', value: 'One' }])
    const second = controller.write([{ path: 'title', value: 'Two', base: 'Old' }])
    assert.deepEqual(await Promise.all([first, second]), [true, false])
    assert.equal(titles.en, 'One')
    assert.match(warnings[0], /someone else changed/)
  })

  for (const retrySucceeds of [true, false]) {
    it(`never uses another locale's own value when the target load fails (retry ${retrySucceeds ? 'succeeds' : 'fails'})`, async () => {
      const { controller, store, setLocale } = await editorWith({ en: 'Hello' })
      let french: string | null = null
      let reads = 0
      let posts = 0
      globalThis.fetch = (async (_url, init) => {
        if (!init?.body && (++reads === 1 || !retrySucceeds)) return new Response('{}', { status: 500 })
        if (init?.body) {
          posts++
          const body = JSON.parse(String(init.body)) as { changes: Array<{ value: string | null; base: unknown }> }
          assert.equal(body.changes[0].base, french ?? 'Hello')
          french = body.changes[0].value
        }
        return new Response(JSON.stringify({ ok: true, values: { title: french ?? 'Hello' }, storedValues: { title: french }, access, updatedAt: `t${posts}` }))
      }) as typeof fetch
      setLocale('fr')
      await controller.load()
      assert.equal(await controller.write([{ path: 'title', value: 'Bonjour', base: 'Hello' }]), retrySucceeds)
      if (!retrySucceeds) {
        assert.equal(posts, 0)
        assert.equal(store.getState().undoStack.length, 0)
        return
      }
      store.undo()
      await settle()
      assert.equal(french, null, 'undo restores the missing French value, not English text')
    })
  }

  it('waits for the target locale values before saving while its first read is pending', async () => {
    const { controller, store, setLocale } = await editorWith({ en: 'Hello' })
    let french: string | null = null
    let posts = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    globalThis.fetch = (async (_url, init) => {
      if (!init?.body) await held
      else {
        posts++
        french = (JSON.parse(String(init.body)) as { changes: Array<{ value: string | null }> }).changes[0].value
      }
      return new Response(JSON.stringify({ ok: true, values: { title: french ?? 'Hello' }, storedValues: { title: french }, access, updatedAt: `t${posts}` }))
    }) as typeof fetch
    setLocale('fr')
    const loading = controller.load()
    const saving = controller.write([{ path: 'title', value: 'Bonjour', base: 'Hello' }])
    await new Promise((resolve) => setImmediate(resolve))
    const earlyPosts = posts
    release()
    await Promise.all([loading, saving])
    assert.equal(earlyPosts, 0, 'a save cannot invent its old locale value')
    store.undo()
    await settle()
    assert.equal(french, null)
  })

  for (const scenario of [
    { name: 'two queued edits', locale: 'en', initial: 'Old', first: 'One', pendingUndo: false, switchLocale: false },
    { name: 'undo while both edits are pending', locale: 'en', initial: 'Old', first: 'One', pendingUndo: true, switchLocale: false },
    { name: 'a missing translation followed by two edits', locale: 'fr', initial: null, first: 'One', pendingUndo: true, switchLocale: false },
    { name: 'a queued edit after clearing a translation', locale: 'fr', initial: 'Old', first: null, pendingUndo: true, switchLocale: false },
    { name: 'a locale switch before queued saves finish', locale: 'fr', initial: null, first: 'One', pendingUndo: true, switchLocale: true },
  ] as const) {
    it(`undo restores the preceding own value for ${scenario.name}`, async () => {
      const { store, controller, setLocale, warnings } = await editorWith({ en: 'English fallback' })
      const titles: Record<string, string | null> = { en: 'English fallback', [scenario.locale]: scenario.initial }
      const posted: Array<{ changes: Array<{ path: string; value: string | null; base: unknown }>; locale: string }> = []
      let release!: () => void
      const held = new Promise<void>((resolve) => { release = resolve })
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) as (typeof posted)[number] : null
        const locale = body?.locale ?? new URL(url, 'http://x').searchParams.get('locale') ?? 'en'
        if (body) {
          posted.push(body)
          if (posted.length === 1) await held
          assert.equal(body.changes[0].base, titles[locale] ?? titles.en)
          titles[locale] = body.changes[0].value
        }
        return new Response(JSON.stringify({
          ok: true, values: { title: titles[locale] ?? titles.en }, storedValues: { title: titles[locale] }, access, updatedAt: `t${posted.length}`,
        }))
      }) as typeof fetch
      setLocale(scenario.locale)
      await controller.load()
      const first = controller.write([{ path: 'title', value: scenario.first, base: scenario.initial ?? titles.en }])
      const second = controller.write([{ path: 'title', value: 'Two', base: scenario.first ?? titles.en }])
      assert.equal(store.getState().undoStack.length, 2, 'both edits enter history before either save completes')
      if (scenario.switchLocale) {
        setLocale('en')
        await controller.load()
      }
      if (scenario.pendingUndo) store.undo()
      release()
      assert.deepEqual(await Promise.all([first, second]), [true, true])
      if (!scenario.pendingUndo) store.undo()
      await settle()
      assert.equal(titles[scenario.locale], scenario.first, 'one undo returns to the immediately preceding own value')
      assert.deepEqual(posted.at(-1)?.changes, [{ path: 'title', value: scenario.first, base: 'Two' }])
      store.undo()
      await settle()
      assert.equal(titles[scenario.locale], scenario.initial, 'the second undo restores the initial own value, including null')
      store.redo()
      store.redo()
      await settle()
      assert.equal(titles[scenario.locale], 'Two')
      assert.deepEqual(warnings, [])
    })
  }

  it('records before the save completes, so immediate undo waits for hooks and never undoes the previous layout action', async () => {
    const titles = { en: 'Old' }
    const { store, controller, warnings } = await editorWith(titles, { trim: true })
    store.apply({ type: 'insert', block: { id: 'b1', type: 'text' }, to: { parentId: null, index: 0 } })
    const original = globalThis.fetch
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let first = true
    globalThis.fetch = (async (url, init) => {
      if (init?.method === 'POST' && first) { first = false; await held }
      return original(url, init)
    }) as typeof fetch
    const saving = controller.write([{ path: 'title', value: '  New  ' }])
    assert.equal(store.getState().undoStack.length, 2)
    store.undo()
    assert.equal(store.getState().layout.blocks.length, 1)
    release()
    await saving
    await settle()
    assert.equal(titles.en, 'Old')
    assert.equal(store.getState().redoStack.length, 1)
    assert.deepEqual(warnings, [])
  })

  it('runs two fast undos in order even when the first network request is slow', async () => {
    const titles = { en: 'Old' }
    const { store, controller, posts, warnings } = await editorWith(titles)
    await controller.write([{ path: 'title', value: 'One' }])
    await controller.write([{ path: 'title', value: 'Two' }])
    const original = globalThis.fetch
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    let requests = 0
    globalThis.fetch = (async (url, init) => {
      if (init?.method === 'POST' && ++requests === 1) await held
      return original(url, init)
    }) as typeof fetch
    store.undo()
    store.undo()
    await settle()
    assert.equal(requests, 1, 'the second undo cannot overtake the first')
    release()
    await settle()
    assert.equal(titles.en, 'Old')
    assert.deepEqual(posts.slice(-2).map((p) => p.changes[0].value), ['One', 'Old'])
    assert.deepEqual(warnings, [])
    assert.equal(store.getState().redoStack.length, 2)
  })

  for (const failure of ['offline', 'locked'] as const) {
    it(`keeps undo after a temporary ${failure} failure, and retries it later`, async () => {
      const titles = { en: 'Old' }
      const { store, controller } = await editorWith(titles)
      await controller.write([{ path: 'title', value: 'New' }])
      const original = globalThis.fetch
      let first = true
      globalThis.fetch = (async (url, init) => {
        if (init?.method === 'POST' && first) {
          first = false
          if (failure === 'offline') throw new Error('Offline')
          return new Response(JSON.stringify({ ok: false, error: 'Another editor holds the lock.' }), { status: 423 })
        }
        return original(url, init)
      }) as typeof fetch
      store.undo()
      await settle()
      assert.equal(titles.en, 'New')
      assert.equal(store.getState().undoStack.length, 1)
      assert.equal(store.getState().redoStack.length, 0)
      store.undo()
      await settle()
      assert.equal(titles.en, 'Old')
      assert.equal(store.getState().redoStack.length, 1)
    })
  }

  it('keeps a failed redo for retry and orders a fast undo followed by redo', async () => {
    const titles = { en: 'Old' }
    const { store, controller } = await editorWith(titles)
    await controller.write([{ path: 'title', value: 'New' }])
    store.undo()
    store.redo()
    await settle()
    assert.equal(titles.en, 'New')
    assert.equal(store.getState().undoStack.length, 1)
    store.undo()
    await settle()
    const original = globalThis.fetch
    let first = true
    globalThis.fetch = (async (url, init) => {
      if (init?.method === 'POST' && first) { first = false; throw new Error('Offline') }
      return original(url, init)
    }) as typeof fetch
    store.redo()
    await settle()
    assert.equal(titles.en, 'Old')
    assert.equal(store.getState().redoStack.length, 1)
    assert.equal(store.getState().undoStack.length, 0)
    store.redo()
    await settle()
    assert.equal(titles.en, 'New')
    assert.equal(store.getState().undoStack.length, 1)
  })

  it('undo restores a missing translation instead of copying its fallback into that locale', async () => {
    const { store, controller, setLocale } = await editorWith({ en: 'Hello' })
    let english = 'Hello'
    let french: string | null = null
    const writes: unknown[] = []
    globalThis.fetch = (async (_url, init) => {
      if (init?.body) {
        const body = JSON.parse(String(init.body)) as { changes: Array<{ value: string | null; base: unknown }> }
        writes.push(body.changes[0])
        assert.equal(body.changes[0].base, french ?? english)
        french = body.changes[0].value
      }
      return new Response(JSON.stringify({ ok: true, values: { title: french ?? english }, storedValues: { title: french }, access, updatedAt: 't' }))
    }) as typeof fetch
    setLocale('fr')
    await controller.load()
    await controller.write([{ path: 'title', value: 'Bonjour' }])
    store.undo()
    await settle()
    assert.deepEqual(writes.at(-1), { path: 'title', value: null, base: 'Bonjour' })
    assert.equal(french, null)
    store.redo()
    await settle()
    assert.equal(french, 'Bonjour')
    store.undo()
    await settle()
    english = 'Changed in English'
    await controller.load()
    assert.equal(controller.state.get().values?.title, 'Changed in English')
  })

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
