'use client'

// Inline text editing on the canvas, admin side. The canvas iframe edits the text in place and
// sends the new prop value about every 150 ms. Each value becomes an `update` operation through
// the store, so it syncs to collaborators like any edit. All updates of one editing session merge
// into one undo step. In a list, Enter and Backspace move the editing to another item: typing,
// the new and joined items and the typing in them stay one undo step until editing ends.

import { createId, findBlock, joinListItem, splitListItem, TEXT_LIST_ITEM_BLOCK, type ListItemEdit } from '../../core'
import type { Block, Operation } from '../../core/types'
import { setPropPath, type InlineKind, type RichCommand, type RichFormatState } from '../../protocol'
import { lockedMessage, propAccessNow } from './fields/accessRules'
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

/**
 * One run of list editing: the undo group of its edits, the session that types now, and the item
 * the next session edits (after Enter or Backspace).
 */
type ListRun = { group: string; session: string | null; next: string | null }
const listRuns = new WeakMap<Runtime, ListRun>()

/**
 * The canvas started an editing session. A session on the item a list key moved to continues that
 * key's run; a new session on a list item starts a run; any other session ends it.
 */
export function noteInlineStart(runtime: Runtime, message: { session: string; id: string; path: string }) {
  const run = listRuns.get(runtime)
  if (run && run.next === message.id) {
    listRuns.set(runtime, { ...run, session: message.session, next: null })
    return
  }
  const block = findBlock(runtime.store.getState().view, message.id)
  if (block?.type === TEXT_LIST_ITEM_BLOCK && message.path === 'text') {
    listRuns.set(runtime, { group: `list:${message.session}`, session: message.session, next: null })
    return
  }
  listRuns.delete(runtime)
}

/** The undo group of a session's edits: its list run's, or none. */
function groupOf(runtime: Runtime, session: string): string | undefined {
  const run = listRuns.get(runtime)
  return run && run.session === session ? run.group : undefined
}

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
  // The block as the canvas shows it (the editor's locale): the store writes that locale.
  const block = findBlock(runtime.store.getState().view, change.id)
  // A prop the user may not change (field access): the canvas session was stopped; drop late values.
  if (block && !propAccessNow(runtime, block, change.path).update) return
  const op = block ? inlineUpdate(block, change.path, change.value) : null
  if (!op) return
  const group = groupOf(runtime, change.session)
  runtime.store.apply(op, { mergeKey: `inline:${change.session}`, mergeWithin: Number.POSITIVE_INFINITY, ...(group ? { group } : {}) })
}

/**
 * The inline start check: the canvas started editing `path` of a block. A prop this user may not
 * read or change (field `access`) is refused: the canvas stops at once and the editor says why.
 * Returns true when it refused.
 */
export function refuseLockedInline(runtime: Runtime, message: { id: string; path: string }): boolean {
  const block = findBlock(runtime.store.getState().view, message.id)
  const text = block ? lockedMessage(runtime, block, message.path) : null
  if (!text) return false
  runtime.postToCanvas({ type: 'inlineStop' })
  runtime.warn(text)
  return true
}

/** Starts inline editing of a block's text (Enter on a selected block), optionally `offset` characters in. */
export function startInlineEditing(runtime: Runtime, id: string, offset?: number) {
  runtime.iframeRef.current?.focus()
  runtime.postToCanvas({ type: 'inlineStart', id, ...(offset === undefined ? {} : { offset }) })
}

/**
 * Applies a list item key press, selects the item to edit and edits it. It joins the undo step of
 * the list run (the session the key ended). A new item's text is typed in the editor's locale.
 */
function applyListItemEdit(runtime: Runtime, edit: ListItemEdit | null) {
  const run = listRuns.get(runtime)
  const group = run?.session ? run.group : undefined
  if (!edit || !runtime.store.apply(edit.ops, { select: edit.editId, newContent: true, ...(group ? { group } : {}) })) return
  if (run && group) listRuns.set(runtime, { group, session: null, next: edit.editId })
  startInlineEditing(runtime, edit.editId, edit.offset)
}

/** Enter in a list item on the canvas: the next item gets the text after the caret. */
export function applyInlineSplit(runtime: Runtime, message: { id: string; after: string }) {
  applyListItemEdit(runtime, splitListItem(runtime.store.getState().view, message.id, message.after, createId()))
}

/** Backspace at the start of a list item on the canvas: it joins the item before. */
export function applyInlineJoin(runtime: Runtime, message: { id: string; value: string }) {
  applyListItemEdit(runtime, joinListItem(runtime.store.getState().view, message.id, message.value))
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
