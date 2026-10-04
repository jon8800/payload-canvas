'use client'

// Keyboard shortcuts. The admin document handles all of them. In the canvas iframe, the canvas
// script already forwards undo, redo, delete and escape; this module adds the rest there.

import { keyAction, type KeyAction } from '../../protocol'
import { findLocation } from '../../core'
import { copySelection, duplicateBlock, moveBy, parseClipboard, pasteBlocks, removeBlock, storedClipboard, toggleHidden } from './actions'
import type { Runtime } from './runtime'

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

/** Elements where editor shortcuts must not fire: text inputs and Payload's modals and drawers. */
export const SHORTCUT_EXCLUDED =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="listbox"], [popover], .drawer, .payload__modal-item, .rs__control'

export function editorAction(e: KeyboardEvent): EditorAction | null {
  const key = keyAction(e)
  if (key) return key
  const mod = e.ctrlKey || e.metaKey
  const letter = e.key.toLowerCase()
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
  }
  if (e.shiftKey && !mod && !e.altKey && e.key === 'Enter') return 'parent'
  if (!mod && !e.altKey && e.key === '?') return 'help'
  return null
}

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** Key caps for the shortcut help, with the platform's modifier key. `ai` adds the assistant shortcut. */
export function shortcutList({ ai = false }: { ai?: boolean } = {}): { keys: string[]; label: string }[] {
  const mod = isMac() ? '⌘' : 'Ctrl'
  return [
    ...(ai ? [{ keys: [mod, 'I'], label: 'Open or close the AI assistant' }] : []),
    { keys: [mod, 'Z'], label: 'Undo' },
    { keys: [mod, 'Shift', 'Z'], label: 'Redo' },
    { keys: [mod, 'C'], label: 'Copy block' },
    { keys: [mod, 'X'], label: 'Cut block' },
    { keys: [mod, 'V'], label: 'Paste into or after the selection' },
    { keys: [mod, 'D'], label: 'Duplicate block' },
    { keys: ['Delete'], label: 'Delete block' },
    { keys: [mod, 'Shift', 'H'], label: 'Hide or show on the site' },
    { keys: [isMac() ? '⌥' : 'Alt', '↑', '↓'], label: 'Move block up or down' },
    { keys: ['Shift', 'Enter'], label: 'Select the parent block' },
    { keys: ['Esc'], label: 'Clear the selection' },
    { keys: ['↑', '↓'], label: 'Previous or next block (outline)' },
    { keys: ['←', '→'], label: 'Collapse or expand (outline)' },
    { keys: ['F2'], label: 'Rename block (outline)' },
    { keys: ['Enter'], label: 'Edit the selected block (outline)' },
    { keys: ['?'], label: 'Show this list' },
  ]
}

function excluded(target: EventTarget | null): boolean {
  const el = target as Element | null
  return Boolean(el?.closest?.(SHORTCUT_EXCLUDED))
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
      default:
        runtime.runKey(action)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || excluded(e.target)) return
    const action = editorAction(e)
    if (!action) return
    if (action === 'assistant' && !runtime.assistant) return
    if (forwarded && keyAction(e)) return
    // Escape closes an open menu or popover first; the selection stays.
    if (action === 'escape' && document.querySelector(':popover-open')) return
    const { selectedId } = runtime.store.getState()
    if ((action === 'copy' || action === 'cut') && (hasTextSelection(doc) || !selectedId)) return
    // Without a selection these keys keep their normal meaning (Alt+arrows, Shift+Enter).
    if ((action === 'moveUp' || action === 'moveDown' || action === 'parent' || action === 'hide') && !selectedId) return
    // Copy and paste keep the browser default, so the native clipboard events still fire.
    if (action !== 'copy' && action !== 'paste') e.preventDefault()
    run(action)
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
  doc.addEventListener('copy', onCopy)
  doc.addEventListener('paste', onPaste)
  return () => {
    if (pasteFallback !== null) window.clearTimeout(pasteFallback)
    doc.removeEventListener('keydown', onKeyDown)
    doc.removeEventListener('copy', onCopy)
    doc.removeEventListener('paste', onPaste)
  }
}
