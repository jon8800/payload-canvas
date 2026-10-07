'use client'

// Keyboard shortcuts. The admin document handles all of them. In the canvas iframe, the canvas
// script already forwards undo, redo, delete and escape; this module adds the rest there.

import { keyAction, type KeyAction } from '../../protocol'
import { findLocation } from '../../core'
import {
  copySelection,
  copyStyles,
  duplicateBlock,
  moveBy,
  parseClipboard,
  pasteBlocks,
  pasteStyles,
  removeBlock,
  storedClipboard,
  toggleHidden,
} from './actions'
import { startInlineEditing } from './inline'
import { leftTabForDigit, selectLeftTab, type LeftTab } from './layout/leftTabs'
import { BLOCK_KEYS, isMac, keyCaps } from './menu/keys'
import { openSelectionMenu, requestRename } from './menu/requests'
import type { Runtime } from './runtime'
import { publishState } from './topbar/document'

export type EditorAction =
  | KeyAction
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'help'
  | 'assistant'
  | 'hide'
  | 'moveUp'
  | 'moveDown'
  | 'parent'
  | 'editText'
  | 'publish'
  | 'copyStyles'
  | 'pasteStyles'
  /** Opens the selected block's menu: the ContextMenu key or Shift+F10. */
  | 'menu'
  | 'rename'
  /** Alt+1, Alt+2, Alt+3: the left panel's Layers, Blocks or Sections tab. */
  | `panel:${LeftTab}`

/**
 * Elements where editor shortcuts must not fire: text inputs, editable text (also text edited
 * on the canvas, which is `plaintext-only`), and Payload's modals and drawers.
 */
export const SHORTCUT_EXCLUDED =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="listbox"], [role="menu"], [popover], .drawer, .payload__modal-item, .rs__control'

/** An open menu or popover (not a tooltip). Escape closes it first, and the selection stays. */
const OPEN_MENU = ':popover-open:not(.builder-tooltip), .builder-menu[data-open]'

/**
 * Ctrl+Alt+<letter> (⌘⌥ on a Mac): Publish (P), copy styles (C), paste styles (V). Ctrl/⌘+Shift+P
 * is taken (a private window in Firefox), Ctrl/⌘+P prints, Ctrl+Shift+C opens the developer tools.
 * On a Mac, Option changes `key` (⌥P types "π"), and some Windows layouts treat Ctrl+Alt as AltGr,
 * so a non-letter `key` falls back to the physical key.
 */
function isModAltKey(e: KeyboardEvent, letter: string, wanted: string): boolean {
  if (!(e.ctrlKey || e.metaKey) || !e.altKey || e.shiftKey) return false
  return letter === wanted || (!/^[a-z]$/.test(letter) && e.code === `Key${wanted.toUpperCase()}`)
}

export function editorAction(e: KeyboardEvent): EditorAction | null {
  const key = keyAction(e)
  if (key) return key
  const mod = e.ctrlKey || e.metaKey
  const letter = e.key.toLowerCase()
  if (isModAltKey(e, letter, 'p')) return 'publish'
  if (isModAltKey(e, letter, 'c')) return 'copyStyles'
  if (isModAltKey(e, letter, 'v')) return 'pasteStyles'
  if (!mod && !e.altKey && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) return 'menu'
  if (!mod && !e.altKey && !e.shiftKey && e.key === 'F2') return 'rename'
  if (mod && !e.shiftKey && !e.altKey) {
    if (letter === 'c') return 'copy'
    if (letter === 'x') return 'cut'
    if (letter === 'v') return 'paste'
    if (letter === 'd') return 'duplicate'
    if (letter === 'i') return 'assistant'
  }
  if (mod && e.shiftKey && !e.altKey && letter === 'h') return 'hide'
  if (e.altKey && !mod && !e.shiftKey) {
    if (e.key === 'ArrowUp') return 'moveUp'
    if (e.key === 'ArrowDown') return 'moveDown'
    // The physical key: on a Mac, Option changes `key` (⌥1 types "¡"); AZERTY needs Shift for digits.
    const tab = /^Digit\d$/.test(e.code) ? leftTabForDigit(e.code.slice(5)) : null
    if (tab) return `panel:${tab}`
  }
  if (e.shiftKey && !mod && !e.altKey && e.key === 'Enter') return 'parent'
  if (!e.shiftKey && !mod && !e.altKey && e.key === 'Enter') return 'editText'
  if (!mod && !e.altKey && e.key === '?') return 'help'
  return null
}

/** The Publish shortcut: key caps, the text for a tooltip ("Ctrl+Alt+P", "⌘⌥P") and `aria-keyshortcuts`. */
export function publishShortcut(): { keys: string[]; text: string; aria: string } {
  return isMac()
    ? { keys: ['⌘', '⌥', 'P'], text: '⌘⌥P', aria: 'Meta+Alt+P' }
    : { keys: ['Ctrl', 'Alt', 'P'], text: 'Ctrl+Alt+P', aria: 'Control+Alt+P' }
}

/**
 * Key caps for the shortcut help, with the platform's modifier key. `ai` adds the assistant
 * shortcut, `publish` the Publish shortcut (collections with drafts).
 */
export function shortcutList({ ai = false, publish = false }: { ai?: boolean; publish?: boolean } = {}): {
  keys: string[]
  label: string
}[] {
  const mod = isMac() ? '⌘' : 'Ctrl'
  return [
    ...(publish ? [{ keys: publishShortcut().keys, label: 'Publish changes' }] : []),
    ...(ai ? [{ keys: [mod, 'I'], label: 'Open or close the AI assistant' }] : []),
    { keys: [mod, 'Z'], label: 'Undo' },
    { keys: [mod, 'Shift', 'Z'], label: 'Redo' },
    { keys: [mod, 'C'], label: 'Copy block' },
    { keys: [mod, 'X'], label: 'Cut block' },
    { keys: [mod, 'V'], label: 'Paste into or after the selection' },
    { keys: [mod, 'D'], label: 'Duplicate block' },
    { keys: keyCaps(BLOCK_KEYS.copyStyles), label: 'Copy the styles of the block' },
    { keys: keyCaps(BLOCK_KEYS.pasteStyles), label: 'Paste styles onto the block' },
    { keys: ['Delete'], label: 'Delete block' },
    { keys: [mod, 'Shift', 'H'], label: 'Hide or show on the site' },
    { keys: [isMac() ? '⌥' : 'Alt', '↑', '↓'], label: 'Move block up or down' },
    { keys: [isMac() ? '⌥' : 'Alt', '1', '2', '3'], label: 'Layers, Blocks or Sections panel' },
    { keys: ['Enter'], label: 'Edit the text of the selected block (or double-click it)' },
    { keys: ['Shift', 'Enter'], label: 'Select the parent block' },
    { keys: ['Shift', 'F10'], label: 'Block menu (or right-click the block)' },
    { keys: ['Esc'], label: 'Clear the selection' },
    { keys: ['↑', '↓'], label: 'Previous or next block (Layers)' },
    { keys: ['←', '→'], label: 'Collapse or expand (Layers)' },
    { keys: ['F2'], label: 'Rename block' },
    { keys: ['Enter'], label: 'Edit the selected block (Layers)' },
    { keys: ['?'], label: 'Show this list' },
  ]
}

/** Keys that act on the selected block. Without a selection they keep their normal meaning. */
const NEEDS_SELECTION = new Set<EditorAction>(['moveUp', 'moveDown', 'parent', 'hide', 'copyStyles', 'pasteStyles', 'menu', 'rename'])

/** Panel keys also work in text fields (the search fields of the panels); they type nothing there. */
const PANEL_KEYS_EXCLUDED = '[role="dialog"], .drawer, .payload__modal-item'

const isPanelAction = (action: EditorAction): action is `panel:${LeftTab}` => action.startsWith('panel:')

/** How long after the menu key its `contextmenu` event may arrive (Windows sends it on key up). */
const MENU_KEY_MS = 1000

function excluded(target: EventTarget | null): boolean {
  const el = target as Element | null
  return Boolean(el?.closest?.(SHORTCUT_EXCLUDED))
}

/** True when the key event targets the page itself (nothing focused), not a control. */
function onPage(target: EventTarget | null, doc: Document): boolean {
  return target === doc.body || target === doc.documentElement || target === null
}

function hasTextSelection(doc: Document): boolean {
  const selection = doc.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim())
}

/**
 * Binds the shortcuts to one document. `forwarded: true` skips the keys the canvas iframe already
 * forwards to the admin (undo, redo, delete, escape), so they never run twice.
 */
export function bindShortcuts(runtime: Runtime, doc: Document, { forwarded }: { forwarded: boolean }): () => void {
  /** Set by Ctrl+V. A native `paste` event clears it; otherwise local storage is pasted. */
  let pasteFallback: number | null = null
  /** Set when a key opened the block menu: the browser's own `contextmenu` event for that key is dropped. */
  let menuKeyAt = 0

  const run = (action: EditorAction) => {
    const { selectedId } = runtime.store.getState()
    switch (action) {
      case 'copy':
        // Local storage and the async clipboard API now; the native `copy` event below fills the
        // system clipboard too where the async API is not allowed.
        copySelection(runtime)
        return
      case 'paste':
        pasteFallback = window.setTimeout(() => {
          pasteFallback = null
          const blocks = parseClipboard(storedClipboard())
          if (blocks) pasteBlocks(runtime, blocks)
        }, 60)
        return
      case 'duplicate':
        if (selectedId) duplicateBlock(runtime, selectedId)
        return
      case 'cut':
        if (selectedId && copySelection(runtime)) removeBlock(runtime, selectedId)
        return
      case 'hide':
        if (selectedId) toggleHidden(runtime, selectedId)
        return
      case 'moveUp':
      case 'moveDown':
        if (selectedId) moveBy(runtime, selectedId, action === 'moveUp' ? -1 : 1)
        return
      case 'parent': {
        const parentId = selectedId ? findLocation(runtime.store.getState().layout, selectedId)?.parentId : null
        if (parentId) runtime.store.select(parentId)
        return
      }
      case 'help':
        runtime.help.set(!runtime.help.get())
        return
      case 'assistant':
        runtime.toggleAssistant()
        return
      case 'editText':
        if (selectedId) startInlineEditing(runtime, selectedId)
        return
      case 'copyStyles':
        if (selectedId) copyStyles(runtime, selectedId)
        return
      case 'pasteStyles':
        if (selectedId) pasteStyles(runtime, [selectedId])
        return
      case 'menu':
        menuKeyAt = performance.now()
        openSelectionMenu(runtime)
        return
      case 'rename':
        // Outside the outline (the outline renames in its row itself).
        if (selectedId) requestRename(runtime, selectedId, 'inspector')
        return
      case 'panel:layers':
      case 'panel:blocks':
      case 'panel:sections':
        selectLeftTab(runtime, action.slice(6) as LeftTab, { focus: true })
        return
      case 'publish': {
        // The same checks as the Publish button; say why when it is disabled.
        const { changed, pending, canPublish } = publishState(runtime.doc.meta.get(), runtime.doc.busy.get(), runtime.live.get())
        if (canPublish) void runtime.doc.run('publish')
        else if (!runtime.doc.meta.get().canUpdate) runtime.notify('You cannot publish this document.')
        else if (!changed) runtime.notify('Nothing changed since the last publish.')
        else if (pending) runtime.notify('Your last change is still saving. Publish again in a moment.')
        return
      }
      default:
        runtime.runKey(action)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return
    const action = editorAction(e)
    if (!action) return
    if (isPanelAction(action)) {
      if ((e.target as Element | null)?.closest?.(PANEL_KEYS_EXCLUDED)) return
      e.preventDefault()
      run(action)
      return
    }
    if (excluded(e.target)) return
    if (action === 'assistant' && !runtime.assistant) return
    // Collections without drafts have no Publish.
    if (action === 'publish' && !runtime.doc.meta.get().drafts) return
    if (forwarded && keyAction(e)) return
    // Escape closes an open menu or popover first; the selection stays.
    if (action === 'escape' && document.querySelector(OPEN_MENU)) return
    const { selectedId } = runtime.store.getState()
    if ((action === 'copy' || action === 'cut') && (hasTextSelection(doc) || !selectedId)) return
    // Without a selection these keys keep their normal meaning (Alt+arrows, Shift+Enter, Shift+F10).
    if (!selectedId && NEEDS_SELECTION.has(action)) return
    // Enter edits text only when nothing else has the focus (a focused button keeps its own Enter).
    // In the canvas, links and buttons inside blocks are not controls, so any target counts.
    if (action === 'editText' && (!selectedId || (!forwarded && !onPage(e.target, doc)))) return
    // Copy and paste keep the browser default, so the native clipboard events still fire.
    if (action !== 'copy' && action !== 'paste') e.preventDefault()
    run(action)
  }

  // The ContextMenu key and Shift+F10 also fire the browser's `contextmenu` event: the editor's
  // menu is open already, so the browser's must not open too.
  const onContextMenu = (e: MouseEvent) => {
    // A right-click (button 2) is the mouse, never the key: it opens the menu as usual.
    if (e.button === 2 || performance.now() - menuKeyAt > MENU_KEY_MS) return
    menuKeyAt = 0
    e.preventDefault()
    e.stopPropagation()
  }

  const onCopy = (e: ClipboardEvent) => {
    if (excluded(e.target) || hasTextSelection(doc)) return
    if (copySelection(runtime, e.clipboardData)) e.preventDefault()
  }

  const onPaste = (e: ClipboardEvent) => {
    if (excluded(e.target)) return
    if (pasteFallback !== null) {
      window.clearTimeout(pasteFallback)
      pasteFallback = null
    }
    const text = e.clipboardData?.getData('text/plain')
    // An empty clipboard (or no access to it): use the copy in local storage.
    const blocks = parseClipboard(text || storedClipboard())
    if (!blocks) return
    e.preventDefault()
    pasteBlocks(runtime, blocks)
  }

  doc.addEventListener('keydown', onKeyDown)
  doc.addEventListener('contextmenu', onContextMenu, true)
  doc.addEventListener('copy', onCopy)
  doc.addEventListener('paste', onPaste)
  return () => {
    if (pasteFallback !== null) window.clearTimeout(pasteFallback)
    doc.removeEventListener('keydown', onKeyDown)
    doc.removeEventListener('contextmenu', onContextMenu, true)
    doc.removeEventListener('copy', onCopy)
    doc.removeEventListener('paste', onPaste)
  }
}
