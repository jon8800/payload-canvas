import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Block, Layout, Operation } from '../../core/types'
import { createEditorStore, type FieldWriteResult } from './store'

const block = (id: string, text = id): Block => ({ id, type: 'heading', props: { text } })
const layout = (...blocks: Block[]): Layout => ({ version: 1, blocks })
const insert = (id: string, index: number): Operation => ({ type: 'insert', block: block(id), to: { parentId: null, index } })
const ids = (l: Layout) => l.blocks.map((b) => b.id)
const textOf = (l: Layout, i: number) => (l.blocks[i].props as { text: string }).text

test('operations with the same group become one undo step; redo re-applies all of them', () => {
  const store = createEditorStore(layout(block('a')))
  store.apply(insert('b', 1), { group: 'ai:t1' })
  store.apply(insert('c', 2), { group: 'ai:t1' })
  store.apply({ type: 'update', id: 'a', props: { text: 'A!' } }, { group: 'ai:t1' })
  assert.deepEqual(ids(store.getState().layout), ['a', 'b', 'c'])
  assert.equal(store.getState().undoStack.length, 1)

  store.undo()
  assert.deepEqual(store.getState().layout, layout(block('a')))
  assert.equal(store.getState().undoStack.length, 0)

  store.redo()
  assert.deepEqual(ids(store.getState().layout), ['a', 'b', 'c'])
  assert.equal(textOf(store.getState().layout, 0), 'A!')
})

test('a list run: typing, a new item and more typing in a group are one undo step with few inverses', () => {
  const store = createEditorStore(layout(block('a', '')))
  const type = (id: string, text: string, session: string) =>
    store.apply({ type: 'update', id, props: { text } }, { group: 'list:s1', mergeKey: `inline:${session}`, mergeWithin: Infinity })
  type('a', 'A', 's1')
  type('a', 'Al', 's1')
  type('a', 'Alpha', 's1')
  store.apply(insert('b', 1), { group: 'list:s1' })
  type('b', 'B', 's2')
  type('b', 'Beta', 's2')
  assert.equal(store.getState().undoStack.length, 1)
  // One inverse per run of typing, one for the insert.
  assert.equal(store.getState().undoStack[0].ops.length, 3)
  store.undo()
  assert.deepEqual(store.getState().layout, layout(block('a', '')))
  store.redo()
  assert.deepEqual(ids(store.getState().layout), ['a', 'b'])
  assert.equal(textOf(store.getState().layout, 1), 'Beta')
})

test('endMerge: the next edit with the same key starts a new undo step', () => {
  const store = createEditorStore(layout(block('a', '')))
  store.apply({ type: 'update', id: 'a', props: { text: 'x' } }, { mergeKey: 'props:a:text' })
  store.apply({ type: 'update', id: 'a', props: { text: 'xy' } }, { mergeKey: 'props:a:text' })
  assert.equal(store.getState().undoStack.length, 1)
  store.endMerge()
  store.apply({ type: 'update', id: 'a', props: { text: 'xyz' } }, { mergeKey: 'props:a:text' })
  assert.equal(store.getState().undoStack.length, 2)
  store.undo()
  assert.equal(textOf(store.getState().layout, 0), 'xy')
})

test('separate turns stay separate undo steps, even right after each other', () => {
  const store = createEditorStore(layout())
  store.apply(insert('a', 0), { group: 'ai:t1' })
  store.apply(insert('b', 1), { group: 'ai:t2' })
  assert.equal(store.getState().undoStack.length, 2)
  store.undo()
  assert.deepEqual(ids(store.getState().layout), ['a'])
})

test("the user's own edit inside a turn ends the group", () => {
  const store = createEditorStore(layout())
  store.apply(insert('a', 0), { group: 'ai:t1' })
  store.apply({ type: 'update', id: 'a', props: { text: 'mine' } })
  store.apply(insert('b', 1), { group: 'ai:t1' })
  assert.equal(store.getState().undoStack.length, 3)
  store.undo()
  assert.deepEqual(ids(store.getState().layout), ['a'])
  assert.equal(textOf(store.getState().layout, 0), 'mine')
})

test('a failed operation leaves the group entry as it is', () => {
  const store = createEditorStore(layout())
  store.apply(insert('a', 0), { group: 'ai:t1' })
  assert.equal(store.apply({ type: 'remove', id: 'missing' }, { group: 'ai:t1' }), false)
  assert.ok(store.getState().lastError)
  assert.equal(store.getState().undoStack.length, 1)
  store.undo()
  assert.deepEqual(store.getState().layout, layout())
})

test('in another locale, prop edits write that locale, shared props stay shared, and undo restores both', () => {
  const defs = [
    {
      type: 'heading',
      label: 'Heading',
      fields: [
        { name: 'text', type: 'text' as const, localized: true },
        { name: 'level', type: 'text' as const },
      ],
    },
  ]
  const settings = { locales: ['en', 'de'], defaultLocale: 'en', fallback: true }
  const store = createEditorStore(layout(block('a', 'Hello')), { localization: { settings, blocks: defs, locale: 'de' } })
  // Untranslated: the view shows the English text.
  assert.equal(textOf(store.getState().view, 0), 'Hello')
  let shared = 0
  store.onSharedEdit(() => shared++)

  store.apply({ type: 'update', id: 'a', props: { text: 'Hallo', level: '1' } })
  const stored = store.getState().layout.blocks[0]
  assert.deepEqual(stored.props, { text: 'Hello', level: '1' })
  assert.deepEqual(stored.locales, { de: { text: 'Hallo' } })
  assert.equal(textOf(store.getState().view, 0), 'Hallo')
  assert.equal(shared, 1)

  store.setLocale('en')
  assert.equal(textOf(store.getState().view, 0), 'Hello')
  store.undo()
  assert.deepEqual(store.getState().layout, layout(block('a', 'Hello')))
})

test('in another locale, a new block holds its text in that locale; a pasted copy keeps its own locale data', () => {
  const defs = [
    {
      type: 'heading',
      label: 'Heading',
      fields: [
        { name: 'text', type: 'text' as const, localized: true },
        { name: 'level', type: 'text' as const },
      ],
    },
  ]
  const settings = { locales: ['en', 'de'], defaultLocale: 'en', fallback: true }
  const store = createEditorStore(layout(), { localization: { settings, blocks: defs, locale: 'de' } })
  const fresh: Block = { id: 'n', type: 'heading', props: { text: 'Neu', level: '2' } }
  store.apply({ type: 'insert', block: fresh, to: { parentId: null, index: 0 } }, { newContent: true })
  assert.deepEqual(store.getState().layout.blocks[0], { id: 'n', type: 'heading', props: { level: '2' }, locales: { de: { text: 'Neu' } } })
  assert.equal(textOf(store.getState().view, 0), 'Neu')

  // A copy (paste, section) is not new content: its values stay the default locale's.
  const copy: Block = { id: 'p', type: 'heading', props: { text: 'Pasted' } }
  store.apply({ type: 'insert', block: copy, to: { parentId: null, index: 1 } })
  assert.deepEqual(store.getState().layout.blocks[1], copy)

  store.setLocale('en')
  assert.equal(store.getState().view.blocks[0].props?.text, undefined)
  store.undo()
  store.undo()
  assert.deepEqual(store.getState().layout, layout())
})

test('field steps (page regions) undo and redo through the writer, in order with layout steps', async () => {
  const store = createEditorStore(layout(block('a')))
  const written: unknown[] = []
  store.setFieldWriter(async (changes) => {
    written.push(changes)
    return true
  })
  store.apply({ type: 'update', id: 'a', props: { text: 'A!' } })
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  assert.equal(store.getState().undoStack.length, 2)

  // The newest step first: the field goes back, and expects the value the step wrote.
  store.undo()
  assert.deepEqual(written, [[{ path: 'title', value: 'Old', base: 'New' }]])
  assert.equal(textOf(store.getState().layout, 0), 'A!', 'the layout is not touched by a field step')
  store.undo()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(textOf(store.getState().layout, 0), 'a')

  store.redo()
  store.redo()
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(written.at(-1), [{ path: 'title', value: 'New', base: 'Old' }])
  assert.equal(store.getState().redoStack.length, 0)
  assert.equal(store.getState().undoStack.length, 2)
})

test('a field step the server refuses (someone changed the field) leaves the history', async () => {
  const store = createEditorStore(layout(block('a')))
  store.setFieldWriter(async () => false)
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  store.undo()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(store.getState().undoStack.length, 0)
  assert.equal(store.getState().redoStack.length, 0)
})

test('a new field step clears the redo stack, as any edit does', () => {
  const store = createEditorStore(layout(block('a')))
  store.apply({ type: 'update', id: 'a', props: { text: 'A!' } })
  store.undo()
  assert.equal(store.getState().redoStack.length, 1)
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  assert.equal(store.getState().redoStack.length, 0)
})

const historySettled = () => new Promise<void>((resolve) => setImmediate(resolve))

test('detached undo and redo callbacks run in order while a field write is pending', async () => {
  const store = createEditorStore(layout(block('a')))
  const pending = Promise.withResolvers<FieldWriteResult>()
  const written: unknown[] = []
  store.setFieldWriter(async (changes) => {
    written.push(changes)
    return written.length === 1 ? pending.promise : true
  })
  store.apply({ type: 'update', id: 'a', props: { text: 'A!' } })
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  const { undo, redo } = store
  undo()
  undo()
  redo()
  redo()
  assert.equal(written.length, 1)
  pending.resolve(true)
  await historySettled()
  assert.deepEqual(written, [
    [{ path: 'title', value: 'Old', base: 'New' }],
    [{ path: 'title', value: 'New', base: 'Old' }],
  ])
  assert.equal(textOf(store.getState().layout, 0), 'A!')
  assert.equal(store.getState().undoStack.length, 2)
  assert.equal(store.getState().redoStack.length, 0)
})

for (const newerEdit of ['layout', 'region'] as const) {
  test(`a failed field undo remains retryable before a newer ${newerEdit} edit`, async () => {
    const store = createEditorStore(layout(block('a')))
    const pending = Promise.withResolvers<FieldWriteResult>()
    const written: unknown[] = []
    store.setFieldWriter(async (changes) => {
      written.push(changes)
      return written.length === 1 ? pending.promise : true
    })
    store.apply({ type: 'update', id: 'a', props: { text: 'A!' } })
    store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
    const originalHistory = store.getState().undoStack
    store.undo()
    store.undo()
    if (newerEdit === 'layout') store.apply({ type: 'update', id: 'a', props: { text: 'Newest' } })
    else store.recordFields([{ path: 'description', before: 'Before', after: 'After' }])
    const latestEntry = store.getState().undoStack.at(-1)!
    pending.resolve('retry')
    await historySettled()
    assert.deepEqual(store.getState().undoStack, [...originalHistory, latestEntry])
    assert.equal(store.getState().redoStack.length, 0)
    assert.equal(written.length, 1, 'the failed write cancels queued undo clicks')

    store.undo()
    await historySettled()
    assert.equal(textOf(store.getState().layout, 0), 'A!')
    store.undo()
    await historySettled()
    assert.deepEqual(written.at(-1), [{ path: 'title', value: 'Old', base: 'New' }])
    store.undo()
    assert.equal(textOf(store.getState().layout, 0), 'a')
    store.redo()
    store.redo()
    store.redo()
    await historySettled()
    assert.equal(store.getState().undoStack.length, 3)
    assert.equal(store.getState().redoStack.length, 0)
    assert.equal(textOf(store.getState().layout, 0), newerEdit === 'layout' ? 'Newest' : 'A!')
    assert.deepEqual(written.at(-1), newerEdit === 'layout'
      ? [{ path: 'title', value: 'New', base: 'Old' }]
      : [{ path: 'description', value: 'After', base: 'Before' }])
  })
}

test('a newer edit still abandons redo when a pending field redo fails', async () => {
  const store = createEditorStore(layout(block('a')))
  const pending = Promise.withResolvers<FieldWriteResult>()
  let writes = 0
  store.setFieldWriter(async () => ++writes === 1 ? true : pending.promise)
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  store.undo()
  await historySettled()
  store.redo()
  store.apply({ type: 'update', id: 'a', props: { text: 'Newest' } })
  pending.resolve('retry')
  await historySettled()
  assert.equal(store.getState().redoStack.length, 0)
  assert.equal(store.getState().undoStack.length, 1)
  store.undo()
  assert.equal(textOf(store.getState().layout, 0), 'a')
})

test('a field redo remains retryable without a newer edit', async () => {
  const store = createEditorStore(layout(block('a')))
  let writes = 0
  store.setFieldWriter(async () => ++writes === 2 ? 'retry' : true)
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  store.undo()
  await historySettled()
  store.redo()
  await historySettled()
  assert.equal(store.getState().redoStack.length, 1)
  assert.equal(store.getState().undoStack.length, 0)
  store.redo()
  await historySettled()
  assert.equal(writes, 3)
  assert.equal(store.getState().redoStack.length, 0)
  assert.equal(store.getState().undoStack.length, 1)
})

for (const result of [true, 'retry'] as const) {
  test(`a reset discards pending history and queued clicks when the field write returns ${result}`, async () => {
    const store = createEditorStore(layout(block('a')))
    const pending = Promise.withResolvers<FieldWriteResult>()
    store.setFieldWriter(() => pending.promise)
    store.apply({ type: 'update', id: 'a', props: { text: 'A!' } })
    store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
    store.undo()
    store.undo()
    store.sync.session(1, layout(block('r')), 'reset', true)
    store.apply({ type: 'update', id: 'r', props: { text: 'Fresh' } })
    pending.resolve(result)
    await historySettled()
    assert.equal(store.getState().undoStack.length, 1)
    assert.equal(store.getState().redoStack.length, 0)
    assert.equal(textOf(store.getState().layout, 0), 'Fresh')
  })
}

test('restoring a failed field undo keeps its order when newer edits reach the history limit', async () => {
  const store = createEditorStore(layout(block('a')))
  const pending = Promise.withResolvers<FieldWriteResult>()
  store.setFieldWriter(() => pending.promise)
  for (let i = 0; i < 200; i++) store.apply({ type: 'update', id: 'a', props: { text: String(i) } })
  store.recordFields([{ path: 'title', before: 'Old', after: 'New' }])
  const fieldEntry = store.getState().undoStack.at(-1)!
  store.undo()
  store.apply({ type: 'update', id: 'a', props: { text: 'Newer' } })
  store.apply({ type: 'update', id: 'a', props: { text: 'Newest' } })
  const newerEntries = store.getState().undoStack.slice(-2)
  pending.resolve('retry')
  await historySettled()
  assert.equal(store.getState().undoStack.length, 200)
  assert.deepEqual(store.getState().undoStack.slice(-3), [fieldEntry, ...newerEntries])
})
