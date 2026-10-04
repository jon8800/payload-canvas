'use client'

import { createContext, use } from 'react'

import { findBlock, setStyleValue, type Breakpoint, type StyleTokens, type Variant } from '../../../core'
import type { ValueStore } from '../valueStore'
import type { Runtime } from '../runtime'
import { variantKey, type StyleReader } from './model'

export type StylesContextValue = {
  blockId: string
  /** The block type: it picks the style groups that open by default. */
  blockType: string
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
  /** Replaces the whole className (raw classes field). */
  setClassName: (className: string, mergeKey?: string) => void
  /** Last refused value ("lg" is not a text color), shown under the variant bar. */
  error: ValueStore<string | null>
}

export const StylesContext = createContext<StylesContextValue | null>(null)

export function useStyles(): StylesContextValue {
  const value = use(StylesContext)
  if (!value) throw new Error('useStyles must be used inside the Styles panel')
  return value
}

/** Reads the latest className from the store, so two edits in one frame never overwrite each other. */
function currentClassName(runtime: Runtime, blockId: string): string {
  return findBlock(runtime.store.getState().layout, blockId)?.className ?? ''
}

export function writeClassName(runtime: Runtime, blockId: string, next: string, mergeKey?: string) {
  // One space between classes: double spaces from typing never reach the stored value.
  const normalized = next.trim().replace(/\s+/g, ' ')
  if (normalized === currentClassName(runtime, blockId)) return
  runtime.store.apply({ type: 'update', id: blockId, className: normalized || null }, { mergeKey })
}

/** Returns an error message when the class model refuses the value. */
export function writeStyle(
  runtime: Runtime,
  blockId: string,
  variant: Variant,
  tokens: StyleTokens,
  property: string,
  value: string | null,
  options?: { negative?: boolean },
): string | null {
  const before = currentClassName(runtime, blockId)
  let next: string
  try {
    next = setStyleValue(before, property, variant, value, { ...options, tokens })
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (next === before) return null
  // Edits to one property at one variant within a second become one undo step (sliders, typing).
  writeClassName(runtime, blockId, next, `style:${blockId}:${property}:${variantKey(variant)}`)
  return null
}
