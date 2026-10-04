'use client'

// The block menu: one definition for the canvas action bar "…", the inspector header "…" and
// the right-click menu on the canvas and in the outline, so they never drift apart.

import { memo, useCallback } from 'react'

import { findBlock, findLocation } from '../../../core'
import {
  copyBlock,
  copyStyles,
  duplicateBlock,
  inRow,
  moveBy,
  pasteStoredBlocks,
  pasteStyles,
  removeBlock,
  resetStyles,
  siblingCount,
  storedStyles,
  toggleHidden,
} from '../actions'
import { useRuntime, type Runtime } from '../runtime'
import { requestSaveSection } from '../sections/SectionDialog'
import { useEditor } from '../store'
import { useValue } from '../valueStore'
import { BLOCK_KEYS, keyText } from './keys'
import { ContextMenu, type MenuEntry } from './Menu'
import { blockMenuRequest, requestRename, type MenuOrigin } from './requests'
import { hasStyles, normalizeClasses } from './styleClipboard'

function StrokeIcon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/** A paintbrush: copy styles. */
const BRUSH = <StrokeIcon d="M13.5 2.5 8.25 7.75M6.75 9.25c-1.4 0-2.25.95-2.25 2.1 0 .85-.55 1.4-1.5 1.65.9.7 2.05 1 3 1 1.75 0 2.75-1.1 2.75-2.35a2.4 2.4 0 0 0-2-2.4z" />
/** A brush over a clipboard line: paste styles. */
const BRUSH_PASTE = <StrokeIcon d="M13.5 2.5 8.25 7.75M6.75 9.25c-1.4 0-2.25.95-2.25 2.1 0 .85-.55 1.4-1.5 1.65.9.7 2.05 1 3 1 1.75 0 2.75-1.1 2.75-2.35a2.4 2.4 0 0 0-2-2.4zM2.5 2.5h5" />
/** An eraser: reset styles. */
const ERASER = <StrokeIcon d="m9.5 3 3.5 3.5-6 6H4l-1.5-1.5a1 1 0 0 1 0-1.4zM6 6.5l3.5 3.5M7 12.5h6.5" />

const keys = (name: keyof typeof BLOCK_KEYS) => keyText(BLOCK_KEYS[name])

/**
 * The actions for one block. `origin` is where the menu opened: "Rename" edits the name in the
 * outline row when it opened there, else in the inspector header.
 */
export function blockMenuEntries(runtime: Runtime, id: string, origin: MenuOrigin): MenuEntry[] {
  const { layout } = runtime.store.getState()
  const block = findBlock(layout, id)
  if (!block) return []
  const location = findLocation(layout, id)
  const parentId = location?.parentId ?? null
  const siblings = location ? siblingCount(layout, location.parentId, location.slot) : 0
  const row = inRow(layout, runtime.measurement.get(), id)
  const styled = hasStyles(runtime.config.blocks, block.type)

  return [
    { icon: 'parent', label: 'Select parent', keys: keys('parent'), disabled: !parentId, run: () => parentId && runtime.store.select(parentId) },
    { icon: 'rename', label: 'Rename', keys: keys('rename'), ownFocus: true, run: () => requestRename(runtime, id, origin === 'outline' ? 'outline' : 'inspector') },
    'separator',
    {
      icon: row ? 'left' : 'up',
      label: row ? 'Move left' : 'Move up',
      keys: keys('moveUp'),
      disabled: !location || location.index === 0,
      run: () => moveBy(runtime, id, -1),
    },
    {
      icon: row ? 'right' : 'down',
      label: row ? 'Move right' : 'Move down',
      keys: keys('moveDown'),
      disabled: !location || location.index >= siblings - 1,
      run: () => moveBy(runtime, id, 1),
    },
    'separator',
    { icon: 'duplicate', label: 'Duplicate', keys: keys('duplicate'), run: () => duplicateBlock(runtime, id) },
    { icon: 'copy', label: 'Copy', keys: keys('copy'), run: () => copyBlock(runtime, id) },
    { icon: 'paste', label: 'Paste inside or after', keys: keys('paste'), run: () => pasteStoredBlocks(runtime) },
    'separator',
    { icon: BRUSH, label: 'Copy styles', keys: keys('copyStyles'), disabled: !styled, run: () => copyStyles(runtime, id) },
    {
      icon: BRUSH_PASTE,
      label: 'Paste styles',
      keys: keys('pasteStyles'),
      disabled: !styled || storedStyles() === null,
      run: () => pasteStyles(runtime, [id]),
    },
    { icon: ERASER, label: 'Reset styles', disabled: !styled || normalizeClasses(block.className) === '', run: () => resetStyles(runtime, [id]) },
    'separator',
    {
      icon: block.hidden ? 'eye' : 'eyeOff',
      label: block.hidden ? 'Show on the site' : 'Hide on the site',
      keys: keys('hide'),
      run: () => toggleHidden(runtime, id),
    },
    ...(runtime.sections.enabled
      ? [{ icon: 'section' as const, label: 'Save as section…', ownFocus: true, run: () => requestSaveSection(runtime, block) }]
      : []),
    'separator',
    { icon: 'delete', label: 'Delete', keys: keys('delete'), danger: true, run: () => removeBlock(runtime, id) },
  ]
}

/**
 * The right-click menu of a block (canvas, outline, keyboard). Opened by `openBlockMenu` in
 * `./requests.ts`. Mounted once, in the overlay.
 */
export const BlockContextMenu = memo(function BlockContextMenu() {
  const runtime = useRuntime()
  const request = useValue(blockMenuRequest(runtime))
  // The block went away (deleted by someone else, or undone): the menu closes.
  const exists = useEditor(runtime.store, (s) => (request ? findBlock(s.layout, request.id) !== null : false))
  const close = useCallback(() => blockMenuRequest(runtime).set(null), [runtime])
  return (
    <ContextMenu
      at={request && exists ? request.at : null}
      onClose={close}
      label="Block actions"
      items={() => (request ? blockMenuEntries(runtime, request.id, request.origin) : [])}
    />
  )
})
