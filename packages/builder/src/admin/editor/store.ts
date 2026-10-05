'use client'

// The editor store: layout, selection, hover and the undo history.
// Every layout change goes through the sync engine (`live/sync.ts`), which applies operations with
// the core module and, in live mode, sends them to the server and rebases them on remote commits.
// Undo stores the INVERSE operations of the user's own edits only. External changes (AI agents,
// other users) replace the layout without entering the history, so undo never
// reverts someone else's edit. Undo applies the inverse as NEW local operations, so it syncs like
// any edit. Parts of it that no longer apply (someone else changed or deleted the block) are skipped.

import { applyOperation, BASE_VARIANT, createLocaleView, findBlock, knownLocale, localizeOperations, stampLocale, type Variant } from '../../core'
import type { Block, BlockDefinition, Layout, LocaleSettings, Operation } from '../../core/types'
import { ACCESS_DENIED_PREFIX } from '../../core/fieldAccess'
import { createSyncEngine, type SyncOptions, type SyncUpdate } from './live/sync'
import { useSelector, type Equality } from './valueStore'

type HistoryEntry = {
  /** Applied in order, these undo (or redo) one user action. */
  ops: Operation[]
  /** Selection to restore when this entry is applied. */
  selectedId: string | null
  /**
   * Consecutive edits with the same key merge into one entry (typing in a text input). In a group
   * entry: the key of the newest edit, so a run of edits to one prop keeps only its first inverse.
   */
  mergeKey?: string
  /** Consecutive edits with the same group merge into one entry, with no time limit (one assistant turn). */
  group?: string
  /** Sync tags of the local changes in this entry. When all were dropped, the entry goes too. */
  tags: string[]
  at: number
}

export type EditorState = {
  /** The stored layout: shared structure, default locale values in `props`, translations in `locales`. */
  layout: Layout
  /**
   * The layout in the locale the editor shows (`resolveLayoutLocale`): what the canvas renders and
   * the inspector edits. The same object as `layout` without localization. Blocks keep their
   * identity while they do not change.
   */
  view: Layout
  /** The locale the editor shows and edits. Null without localization. */
  locale: string | null
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
  /** Edits with the same key within MERGE_WINDOW_MS (or `mergeWithin`) become one undo step. */
  mergeKey?: string
  /**
   * How long after the last edit an edit with the same `mergeKey` still merges, in ms.
   * Default MERGE_WINDOW_MS. An inline editing session passes Infinity: the whole session is one step.
   */
  mergeWithin?: number
  /**
   * Consecutive edits with the same group become one undo step, however far apart in time
   * (all operations of one AI assistant turn). An edit with another group or none ends the group.
   */
  group?: string
  /**
   * `false`: the operations already name their locale (the AI assistant's, a "copy from" action).
   * By default, prop updates without a `locale` write the editor's locale.
   */
  stampLocale?: false
  /**
   * The inserted blocks are new content (a block from the library, a new list item): in another
   * locale than the default, their localized props are written in the editor's locale, and the
   * default locale has no value yet. Copies (paste, duplicate, sections) leave it off and keep
   * their own locale data.
   */
  newContent?: boolean
}

export type EditorStoreOptions = {
  /** Sync engine options (tests pass a manual clock). `clientId` defaults to a random UUID. */
  sync?: Partial<SyncOptions>
  /**
   * Localized layouts: the locales, the block definitions (they say which props are localized) and
   * the locale to start in (default: the default locale).
   */
  localization?: { settings: LocaleSettings; blocks: readonly BlockDefinition[]; locale?: string | null }
}

const HISTORY_LIMIT = 200
const MERGE_WINDOW_MS = 1000

export const UNDO_PARTIAL = "Couldn't undo everything — someone else changed this."
export const UNDO_NONE = "Couldn't undo — someone else changed this."
export const EDIT_DROPPED = 'Someone else changed this block at the same time, so your last edit was not applied.'

export type EditorStore = ReturnType<typeof createEditorStore>

function newClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/** Length of a slot list, or null when the parent does not exist. */
function listLength(layout: Layout, parentId: string | null, slot: string | undefined): number | null {
  if (parentId === null) return layout.blocks.length
  const parent: Block | null = findBlock(layout, parentId)
  return parent ? (parent.slots?.[slot ?? 'children']?.length ?? 0) : null
}

/**
 * Applies `ops` one by one and skips the ones that no longer apply. An insert or move whose index
 * is now out of range goes to the end of its list instead.
 */
export function applyLenient(layout: Layout, ops: Operation[]) {
  let current = layout
  const applied: Operation[] = []
  let skipped = 0
  for (const op of ops) {
    let result = applyOperation(current, op)
    let used = op
    if (!result.ok && (op.type === 'insert' || op.type === 'move')) {
      const length = listLength(current, op.to.parentId, op.to.slot)
      // A move within the same list counts the list without the block.
      for (const index of length === null ? [] : [length, length - 1]) {
        if (index < 0 || index >= op.to.index) continue
        const candidate: Operation = { ...op, to: { ...op.to, index } }
        const retry = applyOperation(current, candidate)
        if (retry.ok) {
          result = retry
          used = candidate
          break
        }
      }
    }
    if (!result.ok) {
      skipped++
      continue
    }
    current = result.layout
    applied.push(used)
  }
  return { layout: current, applied, skipped }
}

export function createEditorStore(initial: Layout, options: EditorStoreOptions = {}) {
  const sync = createSyncEngine(initial, { clientId: newClientId(), ...options.sync })
  const localization = options.localization ?? null
  const localeView = localization ? createLocaleView(localization.blocks, localization.settings) : null
  const viewOf = (layout: Layout, locale: string | null) => (localeView && locale ? localeView(layout, locale) : layout)
  const startLocale = localization ? knownLocale(localization.settings, localization.locale) : null
  let state: EditorState = {
    layout: initial,
    view: viewOf(initial, startLocale),
    locale: startLocale,
    selectedId: null,
    hoveredId: null,
    undoStack: [],
    redoStack: [],
    lastError: null,
    variant: BASE_VARIANT,
    canvasWidth: null,
  }
  const listeners = new Set<() => void>()
  const warnings = new Set<(text: string) => void>()
  const sharedEdits = new Set<() => void>()
  let tagCounter = 0
  const nextTag = () => `t${++tagCounter}`

  const warn = (text: string) => {
    for (const listener of warnings) listener(text)
  }

  const set = (patch: Partial<EditorState>) => {
    const before = state
    state = { ...state, ...patch }
    if (state.layout !== before.layout || state.locale !== before.locale) state = { ...state, view: viewOf(state.layout, state.locale) }
    // Drop a selection or hover that no longer exists.
    if (state.selectedId && !findBlock(state.layout, state.selectedId)) state = { ...state, selectedId: null }
    if (state.hoveredId && !findBlock(state.layout, state.hoveredId)) state = { ...state, hoveredId: null }
    for (const listener of listeners) listener()
  }

  // Remote commits, acknowledgements and sessions: new layout, no history entry.
  sync.subscribe((update: SyncUpdate) => {
    const dropped = new Set(update.dropped)
    const keep = (entry: HistoryEntry) => !(entry.tags.length > 0 && entry.tags.every((tag) => dropped.has(tag)))
    const selectedBefore = state.selectedId
    if (update.reset) {
      // The layout was replaced as a whole: the history no longer applies to it.
      set({ layout: update.layout, undoStack: [], redoStack: [] })
      return
    }
    if (update.layout === state.layout && dropped.size === 0) return
    set({
      layout: update.layout,
      ...(dropped.size > 0 ? { undoStack: state.undoStack.filter(keep), redoStack: state.redoStack.filter(keep) } : {}),
    })
    if (dropped.size > 0) {
      // A refused change to a prop the user may not update says so itself; it is no conflict.
      if (update.error?.startsWith(ACCESS_DENIED_PREFIX)) warn(update.error)
      else warn(update.error ? `${EDIT_DROPPED} (${update.error})` : EDIT_DROPPED)
    }
    else if (selectedBefore && !state.selectedId && update.commit) {
      warn(`${update.commit.actor.label} deleted the block you had selected.`)
    }
  })

  /** Applies a history entry as new local operations. Returns the reverse entry, or null. */
  const replay = (entry: HistoryEntry): { layout: Layout; reverse: HistoryEntry } | null => {
    const { applied, skipped } = applyLenient(state.layout, entry.ops)
    if (applied.length === 0) {
      warn(UNDO_NONE)
      return null
    }
    const tag = nextTag()
    const result = sync.local(applied, tag)
    if (!result.ok) {
      set({ lastError: `Cannot undo or redo: ${result.error}` })
      return null
    }
    if (skipped > 0) warn(UNDO_PARTIAL)
    return {
      layout: result.layout,
      reverse: { ops: result.inverse, selectedId: state.selectedId, tags: [tag], at: Date.now() },
    }
  }

  return {
    /** The sync engine. The live hook connects it to the server. */
    sync,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Called after the user's edit in a non-default locale that changes every locale (blocks, classes, shared props). */
    onSharedEdit(listener: () => void) {
      sharedEdits.add(listener)
      return () => {
        sharedEdits.delete(listener)
      }
    },
    /** Short warnings for the user (an undo or an edit that conflicted with someone else's change). */
    onWarning(listener: (text: string) => void) {
      warnings.add(listener)
      return () => {
        warnings.delete(listener)
      }
    },

    /** Applies the user's own edit. Returns false (and records the error) when the core refuses it. */
    apply(ops: Operation | Operation[], applyOptions: ApplyOptions = {}): boolean {
      let list = Array.isArray(ops) ? ops : [ops]
      if (list.length === 0) return true
      if (localization) {
        // Prop edits write the shown locale; props that are not localized stay shared. The server
        // runs the same `localizeOperations`, so both apply the same operations.
        const stamped =
          applyOptions.stampLocale === false ? list : stampLocale(list, state.locale, localization.settings, { inserts: applyOptions.newContent })
        const localized = localizeOperations(state.layout, stamped, localization.blocks, localization.settings)
        if (!localized.ok) {
          set({ lastError: localized.error })
          return false
        }
        list = localized.ops
      }
      const tag = nextTag()
      const result = sync.local(list, tag)
      if (!result.ok) {
        set({ lastError: result.error })
        return false
      }
      // In another locale than the default, an edit of the structure, the classes or a shared prop
      // changes every locale. The editor says so once (runtime.ts).
      if (localization && state.locale !== localization.settings.defaultLocale && list.some((op) => op.type !== 'update' || op.locale === undefined)) {
        for (const listener of sharedEdits) listener()
      }
      const now = Date.now()
      const top = state.undoStack.at(-1)
      const grouped = Boolean(applyOptions.group) && top?.group === applyOptions.group
      // In a group, more edits of the same merge run (typing in one prop) need no inverse of their
      // own: the run's first inverse, already in the entry, restores the value before the run.
      const sameRun = grouped && Boolean(applyOptions.mergeKey) && top?.mergeKey === applyOptions.mergeKey
      const merge =
        !grouped &&
        applyOptions.mergeKey &&
        top?.mergeKey === applyOptions.mergeKey &&
        now - top.at < (applyOptions.mergeWithin ?? MERGE_WINDOW_MS)
      const undoStack =
        top && grouped
          ? // Undo the newest edit first, then the older ones in the group.
            [
              ...state.undoStack.slice(0, -1),
              {
                ...top,
                ops: sameRun ? top.ops : [...result.inverse, ...top.ops],
                mergeKey: applyOptions.mergeKey,
                tags: [...top.tags, tag],
                at: now,
              },
            ]
          : top && merge
            ? // When merging, keep the older inverse: it already restores the values before the first edit.
              [...state.undoStack.slice(0, -1), { ...top, tags: [...top.tags, tag], at: now }]
            : [
                ...state.undoStack,
                {
                  ops: result.inverse,
                  selectedId: state.selectedId,
                  mergeKey: applyOptions.mergeKey,
                  group: applyOptions.group,
                  tags: [tag],
                  at: now,
                },
              ].slice(-HISTORY_LIMIT)
      set({
        layout: result.layout,
        undoStack,
        redoStack: [],
        lastError: null,
        ...(applyOptions.select !== undefined ? { selectedId: applyOptions.select } : {}),
      })
      return true
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

    /**
     * Ends the current merge run: the next edit starts a new undo step even with the same
     * `mergeKey` (a text field lost the focus). Groups are not affected.
     */
    endMerge() {
      const top = state.undoStack.at(-1)
      if (!top?.mergeKey || top.group) return
      set({ undoStack: [...state.undoStack.slice(0, -1), { ...top, mergeKey: undefined }] })
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
    /** Shows and edits another locale. Unknown codes fall back to the default locale. */
    setLocale(locale: string) {
      if (!localization) return
      const next = knownLocale(localization.settings, locale)
      if (state.locale !== next) set({ locale: next })
    },
    /** The locales, or null without localization. */
    localization: localization?.settings ?? null,
  }
}

/**
 * Subscribes to one slice of the editor state. The component renders only when the slice changes.
 * Without `isEqual` the selector must return a stable reference (a value from the state, or a
 * primitive). With `isEqual` (e.g. `sameItems`) it may build a new array or object.
 */
export function useEditor<T>(store: EditorStore, selector: (state: EditorState) => T, isEqual?: Equality<T>): T {
  return useSelector(store.subscribe, store.getState, selector, isEqual)
}
