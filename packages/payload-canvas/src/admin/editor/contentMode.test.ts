import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { defaultBlocks } from '../../blocks'
import { contentModeProblem } from '../../core/contentMode'
import type { Layout } from '../../core/types'
import { contentModeAllows, contentModeFields, leftTabsFor, setPreviewAsClient } from './contentMode'
import { LEFT_TABS } from './layout/leftTabs'
import { createEditorStore } from './store'
import { createValueStore } from './valueStore'

const blocks = defaultBlocks()
const layout = (): Layout => ({
  version: 1,
  blocks: [
    {
      id: 'faq',
      type: 'stack',
      editableItems: true,
      slots: { children: [{ id: 'q1', type: 'text', props: { text: 'One' } }, { id: 'q2', type: 'text', props: { text: 'Two' } }] },
    },
    { id: 'h', type: 'heading', className: 'text-3xl', props: { text: 'Hello', level: '2' } },
  ],
})

describe('content mode in the editor', () => {
  it('allows item actions only inside a block that lets editors manage its items', () => {
    const l = layout()
    for (const action of ['duplicate', 'delete', 'moveUp', 'moveDown'] as const) {
      assert.equal(contentModeAllows(action, l, 'q1'), true, action)
      assert.equal(contentModeAllows(action, l, 'h'), false, action)
      assert.equal(contentModeAllows(action, l, null), false, action)
    }
    for (const action of ['cut', 'paste', 'hide', 'rename', 'copyStyles', 'pasteStyles', 'panel:blocks', 'panel:sections'] as const) {
      assert.equal(contentModeAllows(action, l, 'q1'), false, action)
    }
    for (const action of ['undo', 'redo', 'editText', 'parent', 'publish', 'copy', 'panel:layers'] as const) {
      assert.equal(contentModeAllows(action, l, 'h'), true, action)
    }
  })

  it('keeps only the Layers tab', () => {
    assert.deepEqual(leftTabsFor(true, LEFT_TABS).map((t) => t.id), ['layers'])
    assert.equal(leftTabsFor(false, LEFT_TABS).length, LEFT_TABS.length)
  })

  it('shows content fields that no binding fills', () => {
    const heading = blocks.find((b) => b.type === 'heading')
    const names = contentModeFields(heading, {}).map((f) => f.name)
    assert.ok(names.includes('text'))
    assert.ok(!names.includes('level'), 'the heading level is design')
    assert.ok(!contentModeFields(heading, { bindings: { text: 'title' } }).some((f) => f.name === 'text'))
  })

  it('"Preview as client" works only for users with design rights', () => {
    const designer = { canEditDesign: true, contentMode: createValueStore(false) }
    setPreviewAsClient(designer, true)
    assert.equal(designer.contentMode.get(), true)
    setPreviewAsClient(designer, false)
    assert.equal(designer.contentMode.get(), false)
    const client = { canEditDesign: false, contentMode: createValueStore(true) }
    setPreviewAsClient(client, false)
    assert.equal(client.contentMode.get(), true)
  })

  it('the store refuses design edits and keeps content edits with the guard on', () => {
    const store = createEditorStore(layout())
    store.setEditGuard((before, after) => contentModeProblem(before, after, blocks))
    assert.equal(store.apply({ type: 'update', id: 'h', props: { text: 'Hi' } }), true)
    assert.equal(store.apply({ type: 'update', id: 'h', className: 'text-xl' }), false)
    assert.match(store.getState().lastError ?? '', /content mode/)
    assert.equal(store.apply({ type: 'remove', id: 'h' }), false)
    assert.equal(store.apply({ type: 'duplicate', id: 'q1', newId: 'q3' }), true)
    assert.equal(store.apply({ type: 'remove', id: 'q2' }), true)
    store.setEditGuard(null)
    assert.equal(store.apply({ type: 'update', id: 'h', className: 'text-xl' }), true)
  })
})
