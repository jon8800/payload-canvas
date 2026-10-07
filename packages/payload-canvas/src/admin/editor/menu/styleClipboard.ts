// Copy and paste of a block's styles: its `className`, with every breakpoint and state variant
// (`md:`, `hover:`), and its animations (`motion`). Pure: the editor actions in `actions.ts` add
// storage and notices.

import { findBlock, getBlockDefinition, normalizeMotion, sameMotion, type BlockMotion } from '../../../core'
import type { BlockDefinition, Layout, Operation } from '../../../core/types'
import { replaceMotionPatch } from '../motion/model'

/** Marks stored text as copied styles. */
const STYLES_MARKER = 'payload-builder/styles@1'

type StylesPayload = { marker: typeof STYLES_MARKER; className: string; motion?: BlockMotion | null }

/**
 * Copied styles. `motion`: the copied animations, null for a block without any, or undefined
 * when the copy is older than animations (pasting it leaves the target's animations alone).
 */
export type CopiedStyles = { className: string; motion?: BlockMotion | null }

/** The text to store for copied styles. */
export function stylesText(className: string | undefined, motion?: BlockMotion): string {
  const payload: StylesPayload = { marker: STYLES_MARKER, className: normalizeClasses(className), motion: motion ?? null }
  return JSON.stringify(payload)
}

/** The copied styles in stored text, or null when the text holds no copied styles. */
export function parseStyles(text: string | null | undefined): CopiedStyles | null {
  if (!text || !text.includes(STYLES_MARKER)) return null
  try {
    const data = JSON.parse(text) as Partial<StylesPayload>
    if (data.marker !== STYLES_MARKER || typeof data.className !== 'string') return null
    const styles: CopiedStyles = { className: normalizeClasses(data.className) }
    if ('motion' in data) styles.motion = normalizeMotion(data.motion) ?? null
    return styles
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
 * The `update` operations that give each block in `ids` the styles: the classes, and the
 * animations when `styles.motion` is not undefined. Blocks that are gone, have no style controls,
 * or already have exactly these styles are skipped. Empty classes remove the `className`. Apply
 * all of them in one `store.apply` call: one undo step.
 */
export function setStylesOps(layout: Layout, blocks: BlockDefinition[], ids: readonly string[], styles: CopiedStyles): Operation[] {
  const next = normalizeClasses(styles.className)
  const motion = styles.motion === undefined ? undefined : (styles.motion ?? undefined)
  const ops: Operation[] = []
  for (const id of new Set(ids)) {
    const block = findBlock(layout, id)
    if (!block || !hasStyles(blocks, block.type)) continue
    const op: Extract<Operation, { type: 'update' }> = { type: 'update', id }
    if (normalizeClasses(block.className) !== next) op.className = next || null
    if (styles.motion !== undefined && !sameMotion(block.motion, motion)) op.motion = replaceMotionPatch(motion)
    if (op.className !== undefined || op.motion !== undefined) ops.push(op)
  }
  return ops
}
