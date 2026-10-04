// Copy and paste of a block's styles: its `className`, with every breakpoint and state variant
// (`md:`, `hover:`). Pure: the editor actions in `actions.ts` add storage and notices.

import { findBlock, getBlockDefinition } from '../../../core'
import type { BlockDefinition, Layout, Operation } from '../../../core/types'

/** Marks stored text as copied styles. */
const STYLES_MARKER = 'payload-builder/styles@1'

type StylesPayload = { marker: typeof STYLES_MARKER; className: string }

/** The text to store for copied styles. */
export function stylesText(className: string | undefined): string {
  const payload: StylesPayload = { marker: STYLES_MARKER, className: normalizeClasses(className) }
  return JSON.stringify(payload)
}

/** The copied classes in stored text, or null when the text holds no copied styles. */
export function parseStyles(text: string | null | undefined): string | null {
  if (!text || !text.includes(STYLES_MARKER)) return null
  try {
    const data = JSON.parse(text) as Partial<StylesPayload>
    return data.marker === STYLES_MARKER && typeof data.className === 'string' ? normalizeClasses(data.className) : null
  } catch {
    return null
  }
}

/** One space between classes, no duplicates, the order kept. */
export function normalizeClasses(className: string | null | undefined): string {
  return [...new Set((className ?? '').split(/\s+/).filter(Boolean))].join(' ')
}

/** True when the block type has style controls (`styles: false` turns them off). */
export function hasStyles(blocks: BlockDefinition[], type: string): boolean {
  return getBlockDefinition(blocks, type)?.styles !== false
}

/**
 * The `update` operations that give each block in `ids` the classes `className`. Blocks that are
 * gone, have no style controls, or already have exactly these classes are skipped. Empty classes
 * remove the `className`. Apply all of them in one `store.apply` call: one undo step.
 */
export function setStylesOps(layout: Layout, blocks: BlockDefinition[], ids: readonly string[], className: string): Operation[] {
  const next = normalizeClasses(className)
  const ops: Operation[] = []
  for (const id of new Set(ids)) {
    const block = findBlock(layout, id)
    if (!block || !hasStyles(blocks, block.type)) continue
    if (normalizeClasses(block.className) === next) continue
    ops.push({ type: 'update', id, className: next || null })
  }
  return ops
}
