import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { Block, Layout, Operation } from '../../core/types'
import { createEditorStore } from './store'

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
