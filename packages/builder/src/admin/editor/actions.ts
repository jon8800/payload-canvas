'use client'

// Editor actions shared by the toolbar, the overlay, the outline, the inspector, the menus and the
// shortcuts: insert, duplicate, remove, hide, move, copy and paste (blocks and styles).

import { createId, findBlock, findLocation, getBlockDefinition, slotAcceptsAt, slotNames } from '../../core'
import type { Block, CanvasMeasurement, Layout, Operation, Position } from '../../core/types'
import { normalizeClasses, parseStyles, setStylesOps, stylesText, type CopiedStyles } from './menu/styleClipboard'
import type { Runtime } from './runtime'

/**
 * Where a click-inserted block goes: into the selected container's first slot, else after the
 * selected block, else at the end of the page. Each choice must pass the nesting rules (a form
 * never goes inside a link). `block` is a block type, or a whole block (paste) whose children count too.
 * A container added while a top-level block is selected goes after it: a new section, not a
 * section inside the selected one.
 */
export function insertPosition(runtime: Runtime, block: string | Block): Position {
  const { blocks } = runtime.config
  const type = typeof block === 'string' ? block : block.type
  const { layout, selectedId } = runtime.store.getState()
  const end: Position = { parentId: null, index: layout.blocks.length }
  const selected = selectedId ? findBlock(layout, selectedId) : null
  if (!selected) return end
  const topLevel = layout.blocks.findIndex((b) => b.id === selected.id)
  if (topLevel >= 0 && slotNames(getBlockDefinition(blocks, type)).length > 0) return { parentId: null, index: topLevel + 1 }
  const slot = slotNames(getBlockDefinition(blocks, selected.type))[0]
  if (slot && slotAcceptsAt(blocks, layout, selected.id, slot, block)) {
    return { parentId: selected.id, slot, index: selected.slots?.[slot]?.length ?? 0 }
  }
  const location = findLocation(layout, selected.id)
  if (!location) return end
  if (!slotAcceptsAt(blocks, layout, location.parentId, location.slot, block)) return end
  return { parentId: location.parentId, slot: location.slot, index: location.index + 1 }
}

/** Sections go on the page level: after the selection's top-level block, or at the end. */
export function sectionPosition(runtime: Runtime): Position {
  const { layout, selectedId } = runtime.store.getState()
  const root = selectedId ? ancestors(layout, selectedId)[0] : undefined
  const index = root ? layout.blocks.findIndex((b) => b.id === root.id) + 1 : layout.blocks.length
  return { parentId: null, index }
}

/** The blocks from the root down to `id`, both included. Empty when `id` is not in the layout. */
export function ancestors(layout: Layout, id: string): Block[] {
  const path: Block[] = []
  for (let current: string | null = id; current; ) {
    const block = findBlock(layout, current)
    if (!block) break
    path.unshift(block)
    current = findLocation(layout, current)?.parentId ?? null
  }
  return path
}

/** A deep copy with new ids for the block and everything inside it. */
export function withNewIds(block: Block): Block {
  const copy: Block = { ...structuredClone(block), id: createId() }
  if (block.slots) {
    copy.slots = Object.fromEntries(Object.entries(block.slots).map(([name, list]) => [name, list.map(withNewIds)]))
  }
  return copy
}

/**
 * Adds a new block of `type` where a click puts it (see insertPosition), selects it, asks the
 * inspector to focus its first field, and says where it went ("Added Heading in Section").
 */
export function insertNewBlock(runtime: Runtime, type: string): boolean {
  return insertNewBlockAt(runtime, type, insertPosition(runtime, type))
}

/** Adds a new block of `type` at `to`, selects it and asks the inspector to focus its first field. */
export function insertNewBlockAt(runtime: Runtime, type: string, to: Position): boolean {
  const block = runtime.createBlock(type)
  if (!block) return false
  if (!runtime.store.apply({ type: 'insert', block, to }, { select: block.id, newContent: true })) return false
  runtime.focusRequest.set(block.id)
  const parent = to.parentId ? findBlock(runtime.store.getState().layout, to.parentId) : null
  const label = runtime.blockLabel(type)
  runtime.notify(parent ? `Added ${label} in ${parent.label?.trim() || runtime.blockLabel(parent.type)}` : `Added ${label}`)
  return true
}

/**
 * `to` with its index clamped to the list as it is now (the page may have changed since the
 * position was picked). Null when the parent block is gone.
 */
export function currentPosition(layout: Layout, to: Position): Position | null {
  if (to.parentId === null) return { ...to, index: Math.min(to.index, layout.blocks.length) }
  const parent = findBlock(layout, to.parentId)
  if (!parent) return null
  return { ...to, index: Math.min(to.index, parent.slots?.[to.slot ?? 'children']?.length ?? 0) }
}

/** Inserts copies (new ids) of `blocks` as one undo step and selects the first one. */
export function insertBlocks(runtime: Runtime, blocks: Block[], to: Position): boolean {
  const fresh = blocks.map(withNewIds)
  const first = fresh[0]
  if (!first) return false
  const ops: Operation[] = fresh.map((block, i) => ({ type: 'insert', block, to: { ...to, index: to.index + i } }))
  return runtime.store.apply(ops, { select: first.id })
}

export function duplicateBlock(runtime: Runtime, id: string) {
  const newId = createId()
  if (runtime.store.apply({ type: 'duplicate', id, newId }, { select: newId })) runtime.notify('Duplicated')
}

export function removeBlock(runtime: Runtime, id: string) {
  const { selectedId, layout } = runtime.store.getState()
  // Keep a useful selection: the parent of the removed block, if the removed block was selected.
  const parentId = findLocation(layout, id)?.parentId ?? null
  runtime.store.apply({ type: 'remove', id }, { select: selectedId === id ? parentId : undefined })
}

export function toggleHidden(runtime: Runtime, id: string) {
  const block = findBlock(runtime.store.getState().layout, id)
  if (block) runtime.store.apply({ type: 'update', id, hidden: !block.hidden })
}

/** Gives a block its own name in the outline and the breadcrumbs. An empty name removes it. */
export function renameBlock(runtime: Runtime, id: string, label: string) {
  const block = findBlock(runtime.store.getState().layout, id)
  const next = label.trim().slice(0, 80)
  if (!block || next === (block.label ?? '')) return
  runtime.store.apply({ type: 'update', id, label: next || null })
}

/** How many blocks are in the list `slot` of `parentId` (the page itself when `parentId` is null). */
export function siblingCount(layout: Layout, parentId: string | null, slot: string): number {
  if (parentId === null) return layout.blocks.length
  return findBlock(layout, parentId)?.slots?.[slot]?.length ?? 0
}

/** True when the block's siblings sit side by side (a row), so "move" means left and right. */
export function inRow(layout: Layout, measurement: CanvasMeasurement | null, id: string): boolean {
  const location = findLocation(layout, id)
  if (!location || !measurement) return false
  const list = location.parentId === null ? layout.blocks : (findBlock(layout, location.parentId)?.slots?.[location.slot] ?? [])
  const neighbor = list[location.index + 1] ?? list[location.index - 1]
  const rectOf = (blockId: string | undefined) => measurement.blocks.find((b) => b.id === blockId)?.rect
  const a = rectOf(id)
  const b = rectOf(neighbor?.id)
  if (!a || !b) return false
  return Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2 && Math.abs(a.x - b.x) > 1
}

export function moveBy(runtime: Runtime, id: string, delta: number) {
  const location = findLocation(runtime.store.getState().layout, id)
  if (!location) return
  runtime.store.apply({
    type: 'move',
    id,
    to: { parentId: location.parentId, slot: location.slot, index: location.index + delta },
  })
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

/** Marks clipboard text as builder blocks. Pasted text without it is ignored. */
const CLIPBOARD_MARKER = 'payload-builder/blocks@1'
/** Same-origin copy of the last copied blocks. Paste falls back to it when the system clipboard is not readable. */
const STORAGE_KEY = 'payload-builder:clipboard'

type ClipboardPayload = { marker: typeof CLIPBOARD_MARKER; blocks: Block[] }

function isBlock(value: unknown): value is Block {
  if (!value || typeof value !== 'object') return false
  const { id, type } = value as Partial<Block>
  return typeof id === 'string' && typeof type === 'string'
}

export function parseClipboard(text: string | null | undefined): Block[] | null {
  if (!text || !text.includes(CLIPBOARD_MARKER)) return null
  try {
    const data = JSON.parse(text) as Partial<ClipboardPayload>
    if (data.marker !== CLIPBOARD_MARKER || !Array.isArray(data.blocks) || !data.blocks.every(isBlock)) return null
    return data.blocks.length > 0 ? data.blocks : null
  } catch {
    return null
  }
}

/** The block as clipboard text, or null when it is not on the page. */
function blockClipboardText(runtime: Runtime, id: string | null): string | null {
  const block = id ? findBlock(runtime.store.getState().layout, id) : null
  if (!block) return null
  const payload: ClipboardPayload = { marker: CLIPBOARD_MARKER, blocks: [block] }
  return JSON.stringify(payload)
}

/** The selected block as clipboard text, or null when nothing is selected. */
export function selectionClipboardText(runtime: Runtime): string | null {
  return blockClipboardText(runtime, runtime.store.getState().selectedId)
}

export function rememberClipboard(text: string) {
  try {
    localStorage.setItem(STORAGE_KEY, text)
  } catch {
    // Storage full or blocked: the system clipboard still has the text.
  }
}

export function storedClipboard(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Copies the block to the system clipboard (into `data` when given) and to local storage. */
export function copyBlock(runtime: Runtime, id: string, data?: DataTransfer | null): boolean {
  const text = blockClipboardText(runtime, id)
  const block = findBlock(runtime.store.getState().layout, id)
  if (!text || !block) return false
  rememberClipboard(text)
  if (data) data.setData('text/plain', text)
  else void navigator.clipboard?.writeText(text).catch(() => undefined)
  runtime.notify(`Copied ${runtime.blockLabel(block.type)}`)
  return true
}

/** Copies the selected block. See `copyBlock`. */
export function copySelection(runtime: Runtime, data?: DataTransfer | null): boolean {
  const { selectedId } = runtime.store.getState()
  return selectedId ? copyBlock(runtime, selectedId, data) : false
}

/** Pastes the blocks in the clipboard copy in local storage, or says there is nothing to paste. */
export function pasteStoredBlocks(runtime: Runtime): boolean {
  const blocks = parseClipboard(storedClipboard())
  if (blocks) return pasteBlocks(runtime, blocks)
  runtime.notify('Nothing to paste. Copy a block first.')
  return false
}

/**
 * Pastes blocks (new ids) into the selected container, or after the selected block, or at the end
 * of the page. Works across pages: the clipboard text carries the whole block tree.
 */
export function pasteBlocks(runtime: Runtime, blocks: Block[]): boolean {
  const first = blocks[0]
  if (!first) return false
  const done = insertBlocks(runtime, blocks, insertPosition(runtime, first))
  if (done) runtime.notify(blocks.length === 1 ? `Pasted ${runtime.blockLabel(first.type)}` : `Pasted ${blocks.length} blocks`)
  return done
}

// ---------------------------------------------------------------------------
// Styles clipboard: a block's classes, with every breakpoint and state, and its animations
// ---------------------------------------------------------------------------

const STYLES_KEY = 'payload-builder:styles'
/** Used when local storage is blocked. */
let stylesFallback: string | null = null

/** The copied styles, or null when no styles were copied. */
export function storedStyles(): CopiedStyles | null {
  try {
    return parseStyles(localStorage.getItem(STYLES_KEY)) ?? parseStyles(stylesFallback)
  } catch {
    return parseStyles(stylesFallback)
  }
}

/** Copies the block's classes (all breakpoints and states) and animations. Other tabs and pages can paste them. */
export function copyStyles(runtime: Runtime, id: string): boolean {
  const block = findBlock(runtime.store.getState().layout, id)
  if (!block) return false
  const text = stylesText(block.className, block.motion)
  stylesFallback = text
  try {
    localStorage.setItem(STYLES_KEY, text)
  } catch {
    // Storage full or blocked: the copy in memory still works on this page.
  }
  const count = normalizeClasses(block.className).split(' ').filter(Boolean).length
  const classes = `${count} ${count === 1 ? 'class' : 'classes'}`
  if (count === 0 && !block.motion) runtime.notify('Copied styles: this block has none')
  else if (!block.motion) runtime.notify(`Copied styles (${classes})`)
  else runtime.notify(count === 0 ? 'Copied styles (animations)' : `Copied styles (${classes} and animations)`)
  return true
}

/** Gives the blocks the copied classes and animations, in place of their own. One undo step. */
export function pasteStyles(runtime: Runtime, ids: readonly string[]): boolean {
  const styles = storedStyles()
  if (styles === null) {
    runtime.notify('Nothing to paste. Copy the styles of a block first.')
    return false
  }
  return applyStyles(runtime, ids, styles, 'Styles pasted')
}

/** Removes every class of the blocks. Animations stay. One undo step. */
export function resetStyles(runtime: Runtime, ids: readonly string[]): boolean {
  return applyStyles(runtime, ids, { className: '' }, 'Styles reset')
}

function applyStyles(runtime: Runtime, ids: readonly string[], styles: CopiedStyles, notice: string): boolean {
  const ops = setStylesOps(runtime.store.getState().layout, runtime.config.blocks, ids, styles)
  if (ops.length === 0) {
    runtime.notify('The styles are the same already.')
    return false
  }
  if (!runtime.store.apply(ops)) return false
  runtime.notify(notice)
  return true
}
