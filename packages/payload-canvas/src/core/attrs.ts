// HTML attributes of a block (`Block.attrs`): an id for anchors, an ARIA label and aria-hidden.
// Pure: no React, no Payload. The renderer spreads them through `attributes`.

import type { Block, BlockAttrs, BlockAttrsPatch, Layout } from './types'

// Local: tree.ts imports this module (normalizeLayout), so it cannot import tree.ts back.
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Letters, digits, "-" and "_", starting with a letter: safe in `#anchor` links and CSS selectors. */
const HTML_ID = /^[A-Za-z][\w-]*$/

/** Why the text cannot be an HTML id, or null when it can. */
export function htmlIdProblem(id: string): string | null {
  if (HTML_ID.test(id)) return null
  return 'An id starts with a letter and holds only letters, digits, "-" and "_".'
}

/**
 * Checks stored or inserted `attrs` and returns them in canonical form: no blank strings, no
 * `ariaHidden: false`, `undefined` when nothing is left. A string is the error message.
 */
export function checkAttrs(value: unknown): BlockAttrs | undefined | string {
  if (value === undefined || value === null) return undefined
  if (!isPlainObject(value)) return 'attrs must be an object'
  const attrs: BlockAttrs = {}
  for (const [key, raw] of Object.entries(value)) {
    if (raw === undefined || raw === null) continue
    if (key === 'id' || key === 'ariaLabel') {
      if (typeof raw !== 'string') return `attrs.${key} must be a string`
      if (!raw.trim()) continue
      if (key === 'id') {
        const problem = htmlIdProblem(raw)
        if (problem) return `attrs.id "${raw}": ${problem}`
      }
      // The label keeps its text as typed: trimming it here would eat the space someone just typed.
      attrs[key] = raw
    } else if (key === 'ariaHidden') {
      if (typeof raw !== 'boolean') return 'attrs.ariaHidden must be a boolean'
      if (raw) attrs.ariaHidden = true
    } else {
      return `Unknown attrs key "${key}". Use id, ariaLabel or ariaHidden.`
    }
  }
  return Object.keys(attrs).length > 0 ? attrs : undefined
}

/**
 * `attrs` after an update patch: each key given replaces that key, `null` (or "" / false) removes
 * it, keys left out stay. `patch: null` removes all. Returns the result and the patch that undoes it.
 */
export function patchAttrs(
  before: BlockAttrs | undefined,
  patch: BlockAttrsPatch | null,
): { attrs: BlockAttrs | undefined; inverse: BlockAttrsPatch | null } | string {
  if (patch === null) return { attrs: undefined, inverse: before ? { ...before } : {} }
  if (!isPlainObject(patch)) return '`attrs` must be an object or null'
  const merged: Record<string, unknown> = { ...before }
  const inverse: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    inverse[key] = before?.[key as keyof BlockAttrs] ?? null
    merged[key] = value
  }
  const attrs = checkAttrs(merged)
  if (typeof attrs === 'string') return attrs
  return { attrs, inverse: inverse as BlockAttrsPatch }
}

/** The HTML attributes of `attrs`, for a block's root element. */
export function htmlAttributes(attrs: BlockAttrs | undefined): Record<string, string> {
  if (!attrs) return {}
  const out: Record<string, string> = {}
  if (attrs.id) out.id = attrs.id
  if (attrs.ariaLabel) out['aria-label'] = attrs.ariaLabel
  if (attrs.ariaHidden) out['aria-hidden'] = 'true'
  return out
}

/** The HTML ids the blocks use (at any depth), each with the id of the block that has it. */
export function htmlIdsOf(blocks: readonly Block[], out = new Map<string, string>()): Map<string, string> {
  for (const block of blocks) {
    if (block.attrs?.id && !out.has(block.attrs.id)) out.set(block.attrs.id, block.id)
    for (const children of Object.values(block.slots ?? {})) htmlIdsOf(children, out)
  }
  return out
}

/** Why the block's subtree cannot join the layout: an HTML id it uses is taken. Null when none is. */
export function htmlIdClash(layout: Layout, block: Block): string | null {
  const taken = htmlIdsOf(layout.blocks)
  for (const [id] of htmlIdsOf([block])) {
    if (taken.has(id)) return `The HTML id "${id}" is already used by block "${taken.get(id)}". Every id is unique in a layout.`
  }
  return null
}

/**
 * The block with every HTML id that `taken` holds removed (at any depth), so a paste, a duplicate
 * or a second copy of a section never repeats an anchor. Unchanged blocks stay the same objects.
 */
export function withoutTakenHtmlIds(block: Block, taken: ReadonlySet<string> | ReadonlyMap<string, unknown>): Block {
  let next = block
  if (block.attrs?.id && taken.has(block.attrs.id)) {
    const { id: _id, ...rest } = block.attrs
    next = { ...block }
    if (Object.keys(rest).length > 0) next.attrs = rest
    else delete next.attrs
  }
  if (!block.slots) return next
  let changed = false
  const slots: Record<string, Block[]> = {}
  for (const [name, children] of Object.entries(block.slots)) {
    slots[name] = children.map((child) => {
      const copy = withoutTakenHtmlIds(child, taken)
      if (copy !== child) changed = true
      return copy
    })
  }
  return changed ? { ...next, slots } : next
}
