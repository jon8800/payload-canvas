import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sectionVersion, switchSectionVariant } from '../../../core/sections'
import type { Layout, SectionDefinition } from '../../../core/types'
import { createEditorStore } from '../store'

const hero: SectionDefinition = {
  id: 'hero',
  label: 'Hero',
  blocks: [{ id: 'hero_1', type: 'stack', slots: { children: [{ id: 'hero_2', type: 'heading', props: { text: 'Welcome' } }] } }],
  variants: [{ id: 'split', label: 'Split', blocks: [{ id: 'hero_split_1', type: 'grid', slots: { children: [{ id: 'hero_split_2', type: 'heading', props: { text: 'Hello' } }] } }] }],
}

test('switching a section in the editor store is one undo step that keeps the edited text', () => {
  const root = { ...sectionVersion(hero)!.blocks[0]!, id: 'r', slots: { children: [{ id: 't', type: 'heading', props: { text: 'My title' } }] } }
  const start: Layout = { version: 1, blocks: [{ id: 'a', type: 'text' }, root] }
  const store = createEditorStore(start)
  const result = switchSectionVariant(store.getState().layout, 'r', [hero], 'split')
  assert.ok(typeof result !== 'string')
  assert.ok(store.apply(result.ops, { select: result.block.id, stampLocale: false }))
  const after = store.getState().layout.blocks[1]!
  assert.equal(after.type, 'grid')
  assert.deepEqual(after.section, { id: 'hero', variant: 'split' })
  assert.equal(after.slots?.children?.[0]?.props?.text, 'My title')
  assert.equal(store.getState().selectedId, result.block.id)
  assert.equal(store.getState().undoStack.length, 1)
  store.undo()
  assert.deepEqual(store.getState().layout, start)
})
