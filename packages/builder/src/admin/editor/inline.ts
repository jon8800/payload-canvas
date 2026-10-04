'use client'

// Inline text editing on the canvas, admin side. The canvas iframe edits the text in place and
// sends the new prop value about every 150 ms. Each value becomes an `update` operation through
// the store, so it syncs to collaborators like any edit. All updates of one editing session merge
// into one undo step.

import { createId, findBlock, joinListItem, splitListItem, type ListItemEdit } from '../../core'
import type { Block, Operation } from '../../core/types'
import { setPropPath, type InlineKind, type RichCommand, type RichFormatState } from '../../protocol'
import type { Runtime } from './runtime'
import { createValueStore, type ValueStore } from './valueStore'

export type InlineEditing = {
  session: string
  id: string
  /** Prop path, e.g. "text" or "items.2.text". */
  path: string
  kind: InlineKind
  /** Rich text: the toolbar state at the caret. */
  format: RichFormatState | null
  /** Set to the current time to open the link form (Ctrl+K in the canvas). */
  linkRequest: number
}

const stores = new WeakMap<Runtime, ValueStore<InlineEditing | null>>()

/** The inline editing session of this editor, or null. */
export function inlineEditing(runtime: Runtime): ValueStore<InlineEditing | null> {
  let store = stores.get(runtime)
  if (!store) {
    store = createValueStore<InlineEditing | null>(null)
    stores.set(runtime, store)
  }
  return store
}

/**
 * The `update` operation that sets the prop at `path` to `value`, or null when nothing changes
 * or the path no longer exists (someone removed the list row).
 */
export function inlineUpdate(block: Block, path: string, value: unknown): Extract<Operation, { type: 'update' }> | null {
  const next = setPropPath(block.props, path, value)
  if (!next) return null
  if (JSON.stringify(block.props?.[next.key]) === JSON.stringify(next.value)) return null
  return { type: 'update', id: block.id, props: { [next.key]: next.value } }
}

/** Applies one value from the canvas. Every change of a session joins the same undo step. */
export function applyInlineChange(runtime: Runtime, change: { session: string; id: string; path: string; value: unknown }) {
  const block = findBlock(runtime.store.getState().layout, change.id)
  const op = block ? inlineUpdate(block, change.path, change.value) : null
  if (!op) return
  runtime.store.apply(op, { mergeKey: `inline:${change.session}`, mergeWithin: Number.POSITIVE_INFINITY })
}

/** Starts inline editing of a block's text (Enter on a selected block), optionally `offset` characters in. */
export function startInlineEditing(runtime: Runtime, id: string, offset?: number) {
  runtime.iframeRef.current?.focus()
  runtime.postToCanvas({ type: 'inlineStart', id, ...(offset === undefined ? {} : { offset }) })
}

/** Applies a list item key press as one undo step, selects the item to edit and edits it. */
function applyListItemEdit(runtime: Runtime, edit: ListItemEdit | null) {
  if (!edit || !runtime.store.apply(edit.ops, { select: edit.editId })) return
  startInlineEditing(runtime, edit.editId, edit.offset)
}

/** Enter in a list item on the canvas: the next item gets the text after the caret. */
export function applyInlineSplit(runtime: Runtime, message: { id: string; after: string }) {
  applyListItemEdit(runtime, splitListItem(runtime.store.getState().layout, message.id, message.after, createId()))
}

/** Backspace at the start of a list item on the canvas: it joins the item before. */
export function applyInlineJoin(runtime: Runtime, message: { id: string; value: string }) {
  applyListItemEdit(runtime, joinListItem(runtime.store.getState().layout, message.id, message.value))
}

/** Ends inline editing, if a session is open. */
export function stopInlineEditing(runtime: Runtime) {
  if (inlineEditing(runtime).get()) runtime.postToCanvas({ type: 'inlineStop' })
}

/** Sends a rich text toolbar command. The canvas iframe gets the keyboard focus back first. */
export function sendRichCommand(runtime: Runtime, command: RichCommand) {
  runtime.iframeRef.current?.contentWindow?.focus()
  runtime.postToCanvas({ type: 'inlineCommand', command })
}

/** The text of the hint for a bound prop. */
export function boundHint(field: string): string {
  return `This text shows the document's “${field}” field. Remove the binding in the inspector to edit it here.`
}
