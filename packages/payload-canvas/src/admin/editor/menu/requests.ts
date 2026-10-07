'use client'

// Requests between the parts of the editor: "open the block menu here" (a right-click on the
// canvas or in the outline, or the ContextMenu key) and "rename this block" (from a menu).
// One value store per editor, like `inlineEditing(runtime)`.

import type { Rect } from '../../../core/types'
import type { Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'
import type { Point } from './Menu'

export type { Point }

/** Where a block menu was opened. "Rename" edits the name in the outline row or in the inspector. */
export type MenuOrigin = 'canvas' | 'outline' | 'inspector'

export type BlockMenuRequest = { id: string; at: Point; origin: MenuOrigin }

export type RenameRequest = { id: string; where: 'outline' | 'inspector' }

function perEditor<T>(initial: T): (runtime: Runtime) => ValueStore<T> {
  const stores = new WeakMap<Runtime, ValueStore<T>>()
  return (runtime) => {
    let store = stores.get(runtime)
    if (!store) {
      store = createValueStore(initial)
      stores.set(runtime, store)
    }
    return store
  }
}

/** The open block context menu, or null. */
export const blockMenuRequest = perEditor<BlockMenuRequest | null>(null)

/** A rename the outline or the inspector should start. The one that starts it sets it back to null. */
export const renameRequest = perEditor<RenameRequest | null>(null)

/** Selects the block and opens its menu at `at` (admin viewport pixels). */
export function openBlockMenu(runtime: Runtime, id: string, at: Point, origin: MenuOrigin) {
  // A new selection closes the other menus first (the dismiss signal), then this one opens.
  if (runtime.store.getState().selectedId !== id) runtime.store.select(id)
  blockMenuRequest(runtime).set({ id, at, origin })
}

/** Starts renaming the block in the outline row or in the inspector header. */
export function requestRename(runtime: Runtime, id: string, where: RenameRequest['where']) {
  if (runtime.store.getState().selectedId !== id) runtime.store.select(id)
  if (where === 'inspector') runtime.inspectorTab.set('block')
  renameRequest(runtime).set({ id, where })
}

/** A point in the canvas iframe (iframe viewport pixels) in admin viewport pixels. */
export function canvasToScreen(runtime: Runtime, point: Point): Point | null {
  const iframe = runtime.iframeRef.current
  if (!iframe) return null
  const frame = iframe.getBoundingClientRect()
  const zoom = runtime.frame.get().zoom || 1
  return { x: frame.left + point.x * zoom, y: frame.top + point.y * zoom }
}

/** Space between a block's corner and the menu opened for it from the keyboard. */
const INSET = 8

/**
 * Where the keyboard opens the menu of a block on the canvas: near the top left corner of the
 * part of the block that is in view (`view`: the iframe viewport). Iframe pixels. Pure.
 */
export function menuPointIn(block: Rect, view: { width: number; height: number }): Point {
  const left = Math.max(block.x, 0)
  const top = Math.max(block.y, 0)
  return {
    x: Math.min(left + INSET, Math.max(0, view.width - INSET)),
    y: Math.min(top + INSET, Math.max(0, view.height - INSET)),
  }
}

/**
 * Opens the selected block's menu from the keyboard (the ContextMenu key, Shift+F10): under the
 * focused outline row, else on the block on the canvas. False when nothing is selected.
 */
export function openSelectionMenu(runtime: Runtime): boolean {
  const { selectedId } = runtime.store.getState()
  if (!selectedId) return false
  const row = runtime.outlineRef.current?.querySelector<HTMLElement>(`[data-outline-row="${CSS.escape(selectedId)}"]`)
  if (row?.contains(document.activeElement)) {
    const rect = row.getBoundingClientRect()
    openBlockMenu(runtime, selectedId, { x: rect.left + 32, y: rect.bottom }, 'outline')
    return true
  }
  const rect = runtime.measurement.get()?.blocks.find((b) => b.id === selectedId)?.rect
  const view = runtime.iframeRef.current?.contentWindow
  const inFrame = rect && view ? menuPointIn(rect, { width: view.innerWidth, height: view.innerHeight }) : null
  const at = inFrame ? canvasToScreen(runtime, inFrame) : null
  if (at) {
    openBlockMenu(runtime, selectedId, at, 'canvas')
    return true
  }
  // Not measured (a hidden block): under the inspector header.
  const head = runtime.inspectorRef.current?.getBoundingClientRect()
  openBlockMenu(runtime, selectedId, { x: (head?.left ?? 0) + INSET, y: (head?.top ?? 0) + 48 }, 'inspector')
  return true
}
