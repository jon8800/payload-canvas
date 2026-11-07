'use client'

// Content mode in the editor (core/contentMode.ts has the rule the server enforces). Clients see
// the Layers tab, the content fields of a block and inline text editing. Inside a block that lets
// editors manage its items, they also duplicate, delete and reorder those items. The store refuses
// any other edit (runtime.ts), so these helpers only decide what the editor shows.

import { contentFields, isEditableItem } from '../../core/contentMode'
import type { Block, BlockDefinition, Layout } from '../../core/types'
import type { DataField } from '../../core/fields'
import type { LeftTab } from './layout/leftTabs'
import type { Runtime } from './runtime'
import type { EditorAction } from './shortcuts'
import { useValue } from './valueStore'

/** The block actions content mode allows on items of a block that lets editors manage them. */
const ITEM_ACTIONS = new Set<EditorAction>(['duplicate', 'delete', 'moveUp', 'moveDown'])

/** Actions that never change the design: they work in content mode on any block. */
const SAFE_ACTIONS = new Set<EditorAction>(['undo', 'redo', 'escape', 'help', 'assistant', 'parent', 'editText', 'publish', 'menu', 'copy', 'panel:layers'])

/** True when content mode allows a keyboard or menu action on the selected block (`id`). */
export function contentModeAllows(action: EditorAction, layout: Layout, id: string | null): boolean {
  if (SAFE_ACTIONS.has(action)) return true
  if (ITEM_ACTIONS.has(action)) return id !== null && isEditableItem(layout, id)
  return false
}

/** The left panel's tabs in content mode: Layers only (no adding blocks or sections). */
export function leftTabsFor<T extends { id: LeftTab }>(contentMode: boolean, tabs: readonly T[]): readonly T[] {
  return contentMode ? tabs.filter((tab) => tab.id === 'layers') : tabs
}

/** The block props content mode shows: content fields that no binding fills. */
export function contentModeFields(definition: Pick<BlockDefinition, 'fields'> | undefined, block: Pick<Block, 'bindings'>): DataField[] {
  return contentFields(definition).filter((field) => !block.bindings?.[field.name])
}

/** True while the editor is in content mode. */
export function useContentMode(runtime: Pick<Runtime, 'contentMode'>): boolean {
  return useValue(runtime.contentMode)
}

/** "Preview as client": a designer sees and edits the page as a client does. No effect without design rights. */
export function setPreviewAsClient(runtime: Pick<Runtime, 'canEditDesign' | 'contentMode'>, on: boolean) {
  if (!runtime.canEditDesign) return
  runtime.contentMode.set(on)
}
