// The text list block (`<ul>` / `<ol>`) and its items. Each item is a `listItem` block in the
// list's `items` slot, so it can be selected, dragged, styled and edited on the canvas like any
// other block. Not to be confused with the collection list (`collectionList`, bindings.ts).
//
// Old layouts kept the items as a prop: `props.items: [{ id?, text }]`. `normalizeLayout` turns
// them into `listItem` blocks on load (`migrateTextList`), and the List component still renders
// the old prop until the layout is saved in the new form.

import type { Block, Layout, Operation } from './types'

export const TEXT_LIST_BLOCK = 'list'
export const TEXT_LIST_ITEM_BLOCK = 'listItem'
/** The slot of a list that holds its items. */
export const TEXT_LIST_SLOT = 'items'

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** True when a binding feeds the old `items` prop (then the old form stays). */
const bindsItems = (block: Block) => Object.keys(block.bindings ?? {}).some((key) => key === 'items' || key.startsWith('items.'))

/**
 * Moves an old list's `props.items` rows into `listItem` blocks in its `items` slot. Rows without
 * text are dropped (the old renderer skipped them). A row's own `id` is kept when it is free.
 * When the slot already has items, the old prop is dropped. A list whose `items` prop is bound to
 * document data keeps the old form. Mutates `block`; `makeId` returns a unique id.
 */
export function migrateTextList(block: Block, makeId: (raw: unknown) => string): void {
  if (block.type !== TEXT_LIST_BLOCK || !block.props || !('items' in block.props) || bindsItems(block)) return
  const { items, ...rest } = block.props
  if (Object.keys(rest).length > 0) block.props = rest
  else delete block.props
  if ((block.slots?.[TEXT_LIST_SLOT]?.length ?? 0) > 0 || !Array.isArray(items)) return
  const children: Block[] = []
  for (const row of items) {
    if (!isObject(row) || typeof row.text !== 'string' || row.text === '') continue
    children.push({ id: makeId(row.id), type: TEXT_LIST_ITEM_BLOCK, props: { text: row.text } })
  }
  if (children.length > 0) block.slots = { ...block.slots, [TEXT_LIST_SLOT]: children }
}

type Located = { block: Block; siblings: Block[]; index: number; parentId: string | null; slot: string }

function locate(blocks: Block[], id: string, parentId: string | null, slot: string): Located | null {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (block.id === id) return { block, siblings: blocks, index, parentId, slot }
    for (const [name, children] of Object.entries(block.slots ?? {})) {
      const found = locate(children, id, block.id, name)
      if (found) return found
    }
  }
  return null
}

/** What a list item key press does: the operations, then the item to edit and the caret offset in it. */
export type ListItemEdit = { ops: Operation[]; editId: string; offset: number }

const textOf = (block: Block) => (typeof block.props?.text === 'string' ? block.props.text : '')

/**
 * Enter in a list item: a new item with `after` (the text after the caret) goes right after it.
 * The edited item keeps the text before the caret (the canvas sends that as its last change).
 * The new item copies the item's classes. Null when `id` is not a list item.
 */
export function splitListItem(layout: Layout, id: string, after: string, newId: string): ListItemEdit | null {
  const found = locate(layout.blocks, id, null, 'children')
  if (!found || found.block.type !== TEXT_LIST_ITEM_BLOCK) return null
  const block: Block = { id: newId, type: TEXT_LIST_ITEM_BLOCK }
  if (after !== '') block.props = { text: after }
  if (found.block.className) block.className = found.block.className
  return {
    ops: [{ type: 'insert', block, to: { parentId: found.parentId, slot: found.slot, index: found.index + 1 } }],
    editId: newId,
    offset: 0,
  }
}

/**
 * Backspace at the start of a list item: its text (`text`, the current value) joins the end of the
 * previous item and the item goes. The caret goes where the two texts meet. Null for the first
 * item or when `id` is not a list item.
 */
export function joinListItem(layout: Layout, id: string, text: string): ListItemEdit | null {
  const found = locate(layout.blocks, id, null, 'children')
  if (!found || found.block.type !== TEXT_LIST_ITEM_BLOCK) return null
  const previous = found.siblings[found.index - 1]
  if (!previous || previous.type !== TEXT_LIST_ITEM_BLOCK) return null
  const before = textOf(previous)
  const ops: Operation[] = []
  if (text !== '') ops.push({ type: 'update', id: previous.id, props: { text: before + text } })
  ops.push({ type: 'remove', id })
  return { ops, editId: previous.id, offset: before.length }
}
