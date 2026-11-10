'use client'

import { createContext, use } from 'react'

import { findBlock, partClassNameOf, setStyleValue, type Breakpoint, type StyleTokens, type Variant } from '../../../core'
import type { BuilderClass } from '../../../classes/shared'
import type { ClassesController } from '../classes/controller'
import type { ValueStore } from '../valueStore'
import type { Runtime } from '../runtime'
import { variantKey, type StyleReader } from './model'

/** What the Styles panel edits: a block's `className`, or with `part`, that part's `partClassName` (`blockParts`). */
export type StyleTarget = { blockId: string; part?: string | null }

export type StylesContextValue = {
  blockId: string
  /** The part (a styled slot or a `parts` entry) whose classes the panel edits. Null: the block's `className`. */
  part: string | null
  /** The block type: it picks the style groups that open by default. */
  blockType: string
  /**
   * The editable class the panel edits instead of the block (its `styles`), or null. Every
   * control then reads and writes the class: every block that uses it changes.
   */
  editingClass: BuilderClass | null
  /** The classes the panel edits: the block's (or part's), or the edited class's `styles`. */
  className: string
  variant: Variant
  tokens: StyleTokens
  read: StyleReader
  /**
   * Reads values at the breakpoint the canvas shows, when that breakpoint is larger than the one
   * being edited. Null otherwise. A value from a breakpoint above the edited one overrides the edit.
   */
  canvasRead: StyleReader | null
  /** The breakpoint the canvas shows. */
  canvasBreakpoint: Breakpoint
  /** Sets (or with `null` clears) one property at the current variant. */
  set: (property: string, value: string | null, options?: { negative?: boolean }) => void
  /** Last refused value ("lg" is not a text color), shown under the variant bar. */
  error: ValueStore<string | null>
}

export const StylesContext = createContext<StylesContextValue | null>(null)

export function useStyles(): StylesContextValue {
  const value = use(StylesContext)
  if (!value) throw new Error('useStyles must be used inside the Styles panel')
  return value
}

/**
 * Reads the latest classes from the store, so two edits in one frame never overwrite each other.
 * A part without classes of its own starts from the classes it inherits (a field's label from its form's).
 */
function currentClassName(runtime: Runtime, { blockId, part }: StyleTarget): string {
  const { layout } = runtime.store.getState()
  if (part) return partClassNameOf(layout, blockId, part, runtime.config.blocks)
  return findBlock(layout, blockId)?.className ?? ''
}

export function writeClassName(runtime: Runtime, target: StyleTarget, next: string, mergeKey?: string) {
  // One space between classes: double spaces from typing never reach the stored value.
  const normalized = next.trim().replace(/\s+/g, ' ')
  if (normalized === currentClassName(runtime, target)) return
  const { blockId, part } = target
  const op = part
    ? ({ type: 'update', id: blockId, partClassName: { [part]: normalized || null } } as const)
    : ({ type: 'update', id: blockId, className: normalized || null } as const)
  runtime.store.apply(op, { mergeKey })
}

/** Returns an error message when the class model refuses the value. */
export function writeStyle(
  runtime: Runtime,
  target: StyleTarget,
  variant: Variant,
  tokens: StyleTokens,
  property: string,
  value: string | null,
  options?: { negative?: boolean },
): string | null {
  const before = currentClassName(runtime, target)
  let next: string
  try {
    next = setStyleValue(before, property, variant, value, { ...options, tokens })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (next === before) return null
  // Edits to one property at one variant within a second become one undo step (sliders, typing).
  writeClassName(runtime, target, next, `style:${target.blockId}:${target.part ?? ''}:${property}:${variantKey(variant)}`)
  return null
}

/**
 * Sets one property of an editable class's styles at a variant, like `writeStyle` does for a
 * block. Returns an error message when the class model refuses the value.
 */
export function writeClassStyle(
  classes: ClassesController,
  id: string | number,
  variant: Variant,
  tokens: StyleTokens,
  property: string,
  value: string | null,
  options?: { negative?: boolean },
): string | null {
  const before = classes.byId(id)?.styles ?? ''
  let next: string
  try {
    next = setStyleValue(before, property, variant, value, { ...options, tokens })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (next === before) return null
  classes.edit(id, 'styles', next || null, `class:${id}:${property}:${variantKey(variant)}`)
  return null
}
