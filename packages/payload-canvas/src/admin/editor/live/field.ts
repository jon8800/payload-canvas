'use client'

// The field this editor is typing in, for collaborators: "Anna is editing this field". A prop path
// of the selected block ("text", "links.0.label"). The inspector sets it while a field has the
// focus; inline editing on the canvas counts too.

import { inlineEditing } from '../inline'
import type { Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'

const stores = new WeakMap<Runtime, ValueStore<string | null>>()

/** The inspector field that has the focus (a prop path of the selected block), or null. */
export function focusedField(runtime: Runtime): ValueStore<string | null> {
  let store = stores.get(runtime)
  if (!store) {
    store = createValueStore<string | null>(null)
    stores.set(runtime, store)
  }
  return store
}

/** The prop path of the selected block this editor types in now: inline on the canvas, else in the inspector. */
export function editingField(runtime: Runtime): string | null {
  const { selectedId } = runtime.store.getState()
  if (!selectedId) return null
  const inline = inlineEditing(runtime).get()
  if (inline) return inline.id === selectedId ? inline.path : null
  return focusedField(runtime).get()
}

/** Calls `listener` when `editingField` may have changed. */
export function subscribeEditingField(runtime: Runtime, listener: () => void): () => void {
  const offInline = inlineEditing(runtime).subscribe(listener)
  const offFocus = focusedField(runtime).subscribe(listener)
  return () => {
    offInline()
    offFocus()
  }
}

/** The block id and prop path of an inspector field path ("builder.<id>.links.0.label"), or null. */
export function propPathOf(fieldPath: string): { blockId: string; path: string } | null {
  const match = /^builder\.([^.]+)\.(.+)$/.exec(fieldPath)
  return match ? { blockId: match[1]!, path: match[2]! } : null
}
