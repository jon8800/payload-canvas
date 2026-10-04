'use client'

// The editor store: layout, selection, hover and the undo history.
// Every layout change goes through `applyOperations` from the core module.
// Undo stores the INVERSE operations of the user's own edits only. External changes (Payload
// form, AI agents, other users) replace the layout without entering the history, so undo never
// reverts someone else's edit.

import { useSyncExternalStore } from 'react'

import { applyOperations, BASE_VARIANT, findBlock, type Variant } from '../../core'
import type { Layout, Operation } from '../../core/types'

type HistoryEntry = {
  /** Applied in order, these undo (or redo) one user action. */
  ops: Operation[]
  /** Selection to restore when this entry is applied. */
  selectedId: string | null
  /** Consecutive edits with the same key merge into one entry (typing in a text input). */
  mergeKey?: string
  /** Consecutive edits with the same group merge into one entry, with no time limit (one assistant turn). */
  group?: string
  at: number
}

export type EditorState = {
  layout: Layout
  selectedId: string | null
  hoveredId: string | null
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  /** Last refused operation, shown in the toolbar. */
  lastError: string | null
  /** Breakpoint and state the Styles panel edits. */
  variant: Variant
  /** Canvas iframe width in CSS pixels. `null` fills the stage (desktop). */
  canvasWidth: number | null
}

export type ApplyOptions = {
  /** Selection after the edit. `undefined` keeps the current selection. */
  select?: string | null
  /** Edits with the same key within MERGE_WINDOW_MS become one undo step. */
  mergeKey?: string
  /**
   * Consecutive edits with the same group become one undo step, however far apart in time
   * (all operations of one AI assistant turn). An edit with another group or none ends the group.
   */
  group?: string
}

const HISTORY_LIMIT = 200
const MERGE_WINDOW_MS = 1000

export type EditorStore = ReturnType<typeof createEditorStore>

export function createEditorStore(initial: Layout) {
  let state: EditorState = {
    layout: initial,
    selectedId: null,
    hoveredId: null,
    undoStack: [],
    redoStack: [],
    lastError: null,
    variant: BASE_VARIANT,
    canvasWidth: null,
  }
  const listeners = new Set<() => void>()

  const set = (patch: Partial<EditorState>) => {
    state = { ...state, ...patch }
    // Drop a selection or hover that no longer exists.
    if (state.selectedId && !findBlock(state.layout, state.selectedId)) state = { ...state, selectedId: null }
    if (state.hoveredId && !findBlock(state.layout, state.hoveredId)) state = { ...state, hoveredId: null }
    for (const listener of listeners) listener()
  }

  /** Applies a history entry and returns the entry that reverses it, or null when it no longer applies. */
  const replay = (entry: HistoryEntry): { layout: Layout; reverse: HistoryEntry } | null => {
    const result = applyOperations(state.layout, entry.ops)
    if (!result.ok) {
      set({ lastError: `Cannot undo or redo: ${result.error}` })
      return null
    }
    return {
      layout: result.layout,
      reverse: { ops: result.inverse, selectedId: state.selectedId, at: Date.now() },
    }
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    /** Applies the user's own edit. Returns false (and records the error) when the core refuses it. */
    apply(ops: Operation | Operation[], options: ApplyOptions = {}): boolean {
      const list = Array.isArray(ops) ? ops : [ops]
      if (list.length === 0) return true
      const result = applyOperations(state.layout, list)
      if (!result.ok) {
        set({ lastError: result.error })
        return false
      }
      const now = Date.now()
      const top = state.undoStack.at(-1)
      const grouped = Boolean(options.group) && top?.group === options.group
      const merge =
        !grouped && options.mergeKey && top?.mergeKey === options.mergeKey && now - top.at < MERGE_WINDOW_MS
      const undoStack =
        top && grouped
          ? // Undo the newest edit first, then the older ones in the group.
            [...state.undoStack.slice(0, -1), { ...top, ops: [...result.inverse, ...top.ops], at: now }]
          : top && merge
            ? // When merging, keep the older inverse: it already restores the values before the first edit.
              [...state.undoStack.slice(0, -1), { ...top, at: now }]
            : [
                ...state.undoStack,
                {
                  ops: result.inverse,
                  selectedId: state.selectedId,
                  mergeKey: options.mergeKey,
                  group: options.group,
                  at: now,
                },
              ].slice(-HISTORY_LIMIT)
      set({
        layout: result.layout,
        undoStack,
        redoStack: [],
        lastError: null,
        ...(options.select !== undefined ? { selectedId: options.select } : {}),
      })
      return true
    },

    /** Replaces the layout with a change that did not come from this user. History stays. */
    load(layout: Layout) {
      set({ layout })
    },

    undo() {
      const entry = state.undoStack.at(-1)
      if (!entry) return
      const done = replay(entry)
      if (!done) {
        set({ undoStack: state.undoStack.slice(0, -1) })
        return
      }
      set({
        layout: done.layout,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, done.reverse],
        selectedId: entry.selectedId,
        lastError: null,
      })
    },

    redo() {
      const entry = state.redoStack.at(-1)
      if (!entry) return
      const done = replay(entry)
      if (!done) {
        set({ redoStack: state.redoStack.slice(0, -1) })
        return
      }
      set({
        layout: done.layout,
        redoStack: state.redoStack.slice(0, -1),
        undoStack: [...state.undoStack, done.reverse],
        selectedId: entry.selectedId,
        lastError: null,
      })
    },

    select(id: string | null) {
      if (state.selectedId !== id) set({ selectedId: id })
    },
    hover(id: string | null) {
      if (state.hoveredId !== id) set({ hoveredId: id })
    },
    clearError() {
      if (state.lastError) set({ lastError: null })
    },
    setVariant(variant: Variant) {
      const { breakpoint, state: current } = state.variant
      if (breakpoint !== variant.breakpoint || current !== variant.state) set({ variant })
    },
    setCanvasWidth(width: number | null) {
      if (state.canvasWidth !== width) set({ canvasWidth: width })
    },
  }
}

/** Subscribes to one slice of the editor state. The selector must return a stable reference. */
export function useEditor<T>(store: EditorStore, selector: (state: EditorState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}
