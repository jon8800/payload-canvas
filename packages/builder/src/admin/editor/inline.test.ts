import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { Block, Layout } from '../../core/types'
import { setPropPath } from '../../protocol'
import { inlineUpdate } from './inline'
import { createEditorStore } from './store'

const list: Block = { id: 'l', type: 'list', props: { items: [{ id: 'r1', text: 'One' }, { id: 'r2', text: 'Two' }], ordered: false } }

describe('setPropPath', () => {
  test('a top-level prop', () => {
    assert.deepEqual(setPropPath({ text: 'a' }, 'text', 'b'), { key: 'text', value: 'b' })
    assert.deepEqual(setPropPath(undefined, 'text', 'b'), { key: 'text', value: 'b' })
  })

  test('a field in an array row copies the rows and keeps the others', () => {
    const props = list.props as { items: Array<{ id: string; text: string }> }
    const next = setPropPath(props, 'items.1.text', 'Deux')
    assert.deepEqual(next, { key: 'items', value: [{ id: 'r1', text: 'One' }, { id: 'r2', text: 'Deux' }] })
    assert.ok(next)
    assert.equal((next.value as unknown[])[0], props.items[0])
    assert.equal(props.items[1].text, 'Two')
  })

  test('a row that no longer exists gives null', () => {
    assert.equal(setPropPath(list.props, 'items.5.text', 'x'), null)
    assert.equal(setPropPath(list.props, 'items.x.text', 'x'), null)
    assert.equal(setPropPath({ text: 'a' }, 'text.deep', 'x'), null)
  })
})

describe('inlineUpdate', () => {
  test('makes one update of the top-level prop', () => {
    assert.deepEqual(inlineUpdate({ id: 'h', type: 'heading', props: { text: 'A' } }, 'text', 'B'), {
      type: 'update',
      id: 'h',
      props: { text: 'B' },
    })
    const op = inlineUpdate(list, 'items.0.text', 'Uno')
    assert.deepEqual(op?.props, { items: [{ id: 'r1', text: 'Uno' }, { id: 'r2', text: 'Two' }] })
  })

  test('no operation when nothing changes or the row is gone', () => {
    assert.equal(inlineUpdate({ id: 'h', type: 'heading', props: { text: 'A' } }, 'text', 'A'), null)
    assert.equal(inlineUpdate(list, 'items.9.text', 'x'), null)
  })

  test('rich text JSON compares by value', () => {
    const content = { root: { type: 'root', children: [] } }
    assert.equal(inlineUpdate({ id: 'r', type: 'richText', props: { content } }, 'content', structuredClone(content)), null)
  })
})

const textOf = (l: Layout) => l.blocks[0].props?.text

describe('one inline editing session is one undo step', () => {
  const layout: Layout = { version: 1, blocks: [{ id: 'h', type: 'heading', props: { text: 'Start' } }] }

  test('updates merge without a time limit and undo restores the start', async () => {
    const store = createEditorStore(layout)
    const options = { mergeKey: 'inline:s1', mergeWithin: Number.POSITIVE_INFINITY }
    store.apply({ type: 'update', id: 'h', props: { text: 'S' } }, options)
    // A pause between keystrokes still merges: the window is Infinity.
    await new Promise((resolve) => setTimeout(resolve, 5))
    store.apply({ type: 'update', id: 'h', props: { text: 'St' } }, options)
    store.apply({ type: 'update', id: 'h', props: { text: 'Stop' } }, options)
    assert.equal(store.getState().undoStack.length, 1)
    store.undo()
    assert.equal(textOf(store.getState().layout), 'Start')
    store.redo()
    assert.equal(textOf(store.getState().layout), 'Stop')
  })

  test('another session is another step', () => {
    const store = createEditorStore(layout)
    store.apply({ type: 'update', id: 'h', props: { text: 'A' } }, { mergeKey: 'inline:s1', mergeWithin: Number.POSITIVE_INFINITY })
    store.apply({ type: 'update', id: 'h', props: { text: 'B' } }, { mergeKey: 'inline:s2', mergeWithin: Number.POSITIVE_INFINITY })
    assert.equal(store.getState().undoStack.length, 2)
    store.undo()
    assert.equal(textOf(store.getState().layout), 'A')
  })
})
