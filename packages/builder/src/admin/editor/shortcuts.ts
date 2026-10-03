'use client'

// Keyboard shortcuts. The admin document handles all of them. In the canvas iframe, the canvas
// script already forwards undo, redo, delete and escape; this module adds the rest there.

import { keyAction, type KeyAction } from '../../protocol'
import { copySelection, duplicateBlock, parseClipboard, pasteBlocks, storedClipboard } from './actions'
import type { Runtime } from './runtime'

export type EditorAction = KeyAction | 'copy' | 'paste' | 'duplicate' | 'help'

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
    if (letter === 'v') return 'paste'
    if (letter === 'd') return 'duplicate'
  }
  if (!mod && !e.altKey && e.key === '?') return 'help'
  return null
}

const isMac = () => typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** Key caps for the shortcut help, with the platform's modifier key. */
export function shortcutList(): { keys: string[]; label: string }[] {
  const mod = isMac() ? '⌘' : 'Ctrl'
  return [
    { keys: [mod, 'Z'], label: 'Undo' },
    { keys: [mod, 'Shift', 'Z'], label: 'Redo' },
    { keys: [mod, 'C'], label: 'Copy block' },
    { keys: [mod, 'V'], label: 'Paste into or after the selection' },
    { keys: [mod, 'D'], label: 'Duplicate block' },
    { keys: ['Delete'], label: 'Delete block' },
    { keys: ['Esc'], label: 'Clear the selection' },
    { keys: ['↑', '↓'], label: 'Previous or next block (outline)' },
    { keys: ['←', '→'], label: 'Collapse or expand (outline)' },
    { keys: ['Enter'], label: 'Edit the selected block' },
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
      case 'help':
        runtime.help.set(!runtime.help.get())
        return
      default:
        runtime.runKey(action)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || excluded(e.target)) return
    const action = editorAction(e)
    if (!action) return
    if (forwarded && keyAction(e)) return
    if (action === 'copy' && (hasTextSelection(doc) || !runtime.store.getState().selectedId)) return
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
