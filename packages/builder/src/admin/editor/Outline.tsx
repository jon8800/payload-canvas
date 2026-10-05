'use client'

import { useDraggable } from '@dnd-kit/core'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { findLocation, getBlockDefinition, slotNames, walkBlocks } from '../../core'
import type { Block, Layout } from '../../core/types'
import { ancestors, duplicateBlock, removeBlock, renameBlock, toggleHidden } from './actions'
import { BlockIcon, Icon, type IconName } from './icons'
import { PeerDots } from './live/PresenceUI'
import { useUntranslated } from './locale/locale'
import { BLOCK_KEYS, keyText } from './menu/keys'
import { openBlockMenu, renameRequest } from './menu/requests'
import { blockPreview, blockSummary, childrenOf, customLabel, typeName } from './names'
import { OUTLINE_INDENT, useRuntime, type DragData, type Runtime } from './runtime'
import { useEditor } from './store'
import { findBindingField, listAncestor, URL_PATH } from './templates/binding'
import { useValue, useValueSelector } from './valueStore'

type Row = {
  block: Block
  depth: number
  container: boolean
  open: boolean
  childCount: number
  /** The preview text after the name. Empty when the parent row already shows the same text. */
  text: string
}

/** Visible rows, depth first. Children of collapsed containers are left out. */
function visibleRows(runtime: Runtime, layout: Layout, collapsed: ReadonlySet<string>): Row[] {
  const out: Row[] = []
  const visit = (blocks: Block[], depth: number, parentText: string) => {
    for (const block of blocks) {
      const container = slotNames(getBlockDefinition(runtime.config.blocks, block.type)).length > 0
      const children = childrenOf(block)
      const open = !collapsed.has(block.id)
      const preview = blockPreview(block)
      // "Section · Our services" > "Stack · Our services" says the same thing twice.
      const text = container && preview === parentText ? '' : preview
      out.push({ block, depth, container, open, childCount: children.length, text })
      if (open) visit(children, depth + 1, preview)
    }
  }
  visit(layout.blocks, 0, '')
  return out
}

function countBlocks(layout: Layout): number {
  let total = 0
  walkBlocks(layout, () => {
    total++
  })
  return total
}

function setCollapsed(runtime: Runtime, id: string, collapse: boolean) {
  const current = runtime.collapsed.get()
  if (current.has(id) === collapse) return
  const next = new Set(current)
  if (collapse) next.add(id)
  else next.delete(id)
  runtime.collapsed.set(next)
}

function focusRow(runtime: Runtime, id: string) {
  const row = runtime.outlineRef.current?.querySelector<HTMLElement>(`[data-outline-row="${CSS.escape(id)}"]`)
  row?.focus({ preventScroll: true })
  row?.scrollIntoView({ block: 'nearest' })
}

function selectRow(runtime: Runtime, row: Row | undefined) {
  if (!row) return
  runtime.store.select(row.block.id)
  focusRow(runtime, row.block.id)
}

/** Problem messages by block id. */
function issuesByBlock(problems: readonly { blockId?: string | null; message: string }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const p of problems) if (p.blockId) out.set(p.blockId, [...(out.get(p.blockId) ?? []), p.message])
  return out
}

/** Ids of the blocks with a binding that reads a field its collection does not have. */
function brokenBindingIds(runtime: Runtime, layout: Layout, templateTarget: string | null): Set<string> {
  const out = new Set<string>()
  walkBlocks(layout, (block) => {
    if (hasBrokenBinding(runtime, layout, block, templateTarget)) out.add(block.id)
  })
  return out
}

const NO_ISSUES: string[] = []

/** True when a binding of the block reads a field its collection does not have (or there is no collection). */
function hasBrokenBinding(runtime: Runtime, layout: Layout, block: Block, templateTarget: string | null): boolean {
  const paths = Object.values(block.bindings ?? {})
  if (paths.length === 0) return false
  const list = listAncestor(layout, block.id)
  const listCollection = typeof list?.props?.collection === 'string' ? list.props.collection : null
  const collection = list ? listCollection : templateTarget
  if (!collection) return true
  const fields = runtime.config.templates?.sources?.[collection] ?? []
  return paths.some((path) => path !== URL_PATH && !findBindingField(fields, path))
}

/**
 * The outline tree. Rows stay a flat list, which keeps them simple to measure for drop targets.
 * Keyboard: one row is in the tab order (the selected one, else the first). Arrow keys move and
 * select, Left and Right collapse and expand, Home and End jump, F2 renames, Enter edits the block.
 */
export function Outline() {
  const runtime = useRuntime()
  const { store, outlineRef } = runtime
  // The outline shows the text of the editor's locale.
  const layout = useEditor(store, (s) => s.view)
  const untranslated = useUntranslated(runtime)
  const collapsed = useValue(runtime.collapsed)
  const rows = useMemo(() => visibleRows(runtime, layout, collapsed), [runtime, layout, collapsed])
  const rowIds = useMemo(() => new Set(rows.map((r) => r.block.id)), [rows])
  // Not the selected id itself: then a new selection renders only the two rows it changes, not the list.
  // The selected row is in the tab order (each row knows); without a visible selection, the first row is.
  const noSelectedRow = useEditor(store, (s) => !s.selectedId || !rowIds.has(s.selectedId))
  const total = useMemo(() => countBlocks(layout), [layout])
  const problems = useValue(runtime.problems)
  const issues = useMemo(() => issuesByBlock(problems), [problems])
  const templateTarget = useValueSelector(runtime.template, (t) => (t.isTemplate ? t.target : null))
  const broken = useMemo(() => brokenBindingIds(runtime, layout, templateTarget), [runtime, layout, templateTarget])
  const [renamingHere, setRenaming] = useState<string | null>(null)
  // "Rename" in a block menu opened from a row renames in the row.
  const requested = useValueSelector(renameRequest(runtime), (r) => (r?.where === 'outline' ? r.id : null))
  const renaming = renamingHere ?? requested
  const onRename = useCallback(
    (id: string | null) => {
      setRenaming(id)
      if (id === null && renameRequest(runtime).get()?.where === 'outline') renameRequest(runtime).set(null)
    },
    [runtime],
  )
  const firstId = rows[0]?.block.id ?? null

  // A block selected on the canvas opens its collapsed ancestors and scrolls into view.
  useEffect(() => {
    let last = store.getState().selectedId
    let frame = 0
    const reveal = (selectedId: string) => {
      const closed = ancestors(store.getState().layout, selectedId)
        .slice(0, -1)
        .filter((b) => runtime.collapsed.get().has(b.id))
      if (closed.length > 0) {
        const next = new Set(runtime.collapsed.get())
        for (const b of closed) next.delete(b.id)
        runtime.collapsed.set(next)
      }
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        outlineRef.current?.querySelector(`[data-outline-row="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' })
      })
    }
    if (last) reveal(last)
    const unsubscribe = store.subscribe(() => {
      const { selectedId } = store.getState()
      if (selectedId === last) return
      last = selectedId
      if (selectedId) reveal(selectedId)
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
    }
  }, [runtime, store, outlineRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.target as HTMLElement).dataset.outlineRow) return
    const { selectedId } = store.getState()
    const focusId = selectedId && rowIds.has(selectedId) ? selectedId : firstId
    const index = rows.findIndex((r) => r.block.id === focusId)
    const row = rows[index]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        // Nothing selected yet: the first press selects the focused row.
        selectRow(runtime, selectedId ? rows[index + 1] : row)
        return
      case 'ArrowUp':
        e.preventDefault()
        selectRow(runtime, selectedId ? rows[Math.max(0, index - 1)] : row)
        return
      case 'Home':
        e.preventDefault()
        selectRow(runtime, rows[0])
        return
      case 'End':
        e.preventDefault()
        selectRow(runtime, rows.at(-1))
        return
      case 'ArrowLeft': {
        if (!row) return
        e.preventDefault()
        if (row.container && row.open && row.childCount > 0) return setCollapsed(runtime, row.block.id, true)
        const parentId = findLocation(layout, row.block.id)?.parentId
        if (parentId) selectRow(runtime, rows.find((r) => r.block.id === parentId))
        return
      }
      case 'ArrowRight':
        if (!row?.container) return
        e.preventDefault()
        if (!row.open) return setCollapsed(runtime, row.block.id, false)
        if (row.childCount > 0) selectRow(runtime, rows[index + 1])
        return
      case 'F2':
        if (!row) return
        e.preventDefault()
        runtime.store.select(row.block.id)
        setRenaming(row.block.id)
        return
      case 'Enter': {
        if (!row) return
        e.preventDefault()
        runtime.store.select(row.block.id)
        runtime.inspectorTab.set('block')
        requestAnimationFrame(() => {
          const input = runtime.inspectorRef.current?.querySelector<HTMLElement>(
            '.builder-editor__fields input:not([type="hidden"]), .builder-editor__fields textarea, .builder-editor__fields [contenteditable="true"], .builder-editor__fields select',
          )
          input?.focus()
        })
      }
    }
  }

  return (
    <div className="builder-editor__panel builder-editor__panel--grow builder-editor__outline-panel">
      <div className="builder-editor__panel-head">
        <h3 className="builder-editor__panel-title">
          <Icon name="layers" size={14} /> Outline
        </h3>
        {total > 0 && <span className="builder-editor__count">{total}</span>}
        <span className="builder-editor__panel-tools">
          <button
            type="button"
            className="builder-editor__icon-button builder-editor__icon-button--small"
            aria-label="Collapse all"
            data-tooltip="Collapse all"
            onClick={() => {
              const ids = new Set(runtime.collapsed.get())
              walkBlocks(layout, (b) => {
                if (childrenOf(b).length > 0) ids.add(b.id)
              })
              runtime.collapsed.set(ids)
            }}
          >
            <Icon name="chevronRight" size={14} />
          </button>
          <button
            type="button"
            className="builder-editor__icon-button builder-editor__icon-button--small"
            aria-label="Expand all"
            data-tooltip="Expand all"
            onClick={() => runtime.collapsed.set(new Set())}
          >
            <Icon name="chevronDown" size={14} />
          </button>
        </span>
      </div>
      {rows.length === 0 ? (
        <div ref={outlineRef} className="builder-editor__outline">
          <div className="builder-editor__empty">
            <Icon name="layers" size={20} />
            <p>The page is empty.</p>
            <p className="builder-editor__hint">Drag a block or a section here or onto the canvas. A click adds it too.</p>
          </div>
        </div>
      ) : (
        // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard navigation for the tree rows
        <div ref={outlineRef} className="builder-editor__outline" role="tree" aria-label="Outline" tabIndex={-1} onKeyDown={onKeyDown}>
          {rows.map((row) => (
            <OutlineRow
              key={row.block.id}
              block={row.block}
              depth={row.depth}
              container={row.container}
              open={row.open}
              childCount={row.childCount}
              text={row.text}
              issues={issues.get(row.block.id) ?? NO_ISSUES}
              untranslated={untranslated.get(row.block.id)?.length ?? 0}
              broken={broken.has(row.block.id)}
              focusable={noSelectedRow && row.block.id === firstId}
              renaming={renaming === row.block.id}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Inline actions must not start a drag or select the row. */
const stop = (e: ReactPointerEvent) => e.stopPropagation()

/** Right-click on a row: the block menu at the pointer. The rename input keeps the browser's menu. */
function openRowMenu(runtime: Runtime, id: string, e: ReactMouseEvent) {
  if (e.target instanceof HTMLInputElement) return
  e.preventDefault()
  openBlockMenu(runtime, id, { x: e.clientX, y: e.clientY }, 'outline')
}

/** Plain props, so `memo` skips rows whose block and state did not change. */
type OutlineRowProps = Row & {
  /** Publish problems of this block. */
  issues: string[]
  /** Localized props that show the fallback language's value in the editor's locale. */
  untranslated: number
  /** A binding reads a field the collection does not have. */
  broken: boolean
  /** In the tab order although not selected: the first row while no visible row is selected. */
  focusable: boolean
  renaming: boolean
  /** Starts (an id) or ends (null) renaming. */
  onRename: (id: string | null) => void
}

const OutlineRow = memo(function OutlineRow({
  block,
  depth,
  container,
  open,
  childCount,
  text,
  issues,
  untranslated,
  broken,
  focusable,
  renaming,
  onRename,
}: OutlineRowProps) {
  const runtime = useRuntime()
  const selected = useEditor(runtime.store, (s) => s.selectedId === block.id)
  const hovered = useEditor(runtime.store, (s) => s.hoveredId === block.id)
  // A boolean, so rows do not render on every pointer move of a drag.
  const dragging = useValueSelector(runtime.drag, (drag) => drag?.source.kind === 'block' && drag.source.id === block.id)
  const typeLabel = runtime.blockLabel(block.type)
  const icon = runtime.blockIcon(block.type)
  const data: DragData = { source: { kind: 'block', id: block.id }, label: typeLabel, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `outline:${block.id}`, data, disabled: renaming })
  const label = customLabel(block)
  const name = label ?? typeName(block, typeLabel)
  const bindingCount = Object.keys(block.bindings ?? {}).length
  const tag = typeof block.props?.as === 'string' && block.props.as !== 'div' ? ` <${block.props.as}>` : ''

  const className = [
    'builder-editor__row',
    selected && 'builder-editor__row--selected',
    hovered && 'builder-editor__row--hovered',
    dragging && 'builder-editor__row--dragging',
    block.hidden && 'builder-editor__row--hidden',
    issues.length > 0 && 'builder-editor__row--problem',
  ]
    .filter(Boolean)
    .join(' ')

  const actions: { icon: IconName; label: string; keys: readonly string[]; run: () => void; danger?: boolean }[] = [
    { icon: 'rename', label: 'Rename', keys: BLOCK_KEYS.rename, run: () => onRename(block.id) },
    {
      icon: block.hidden ? 'eye' : 'eyeOff',
      label: block.hidden ? 'Show on the site' : 'Hide on the site',
      keys: BLOCK_KEYS.hide,
      run: () => toggleHidden(runtime, block.id),
    },
    { icon: 'duplicate', label: 'Duplicate', keys: BLOCK_KEYS.duplicate, run: () => duplicateBlock(runtime, block.id) },
    { icon: 'delete', label: 'Delete', keys: BLOCK_KEYS.delete, run: () => removeBlock(runtime, block.id), danger: true },
  ]

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the tree handles the keyboard (arrows, Enter, F2)
    <div
      ref={setNodeRef}
      data-outline-row={block.id}
      data-depth={depth}
      className={className}
      onClick={() => runtime.store.select(block.id)}
      onDoubleClick={() => onRename(block.id)}
      onContextMenu={(e) => openRowMenu(runtime, block.id, e)}
      // Not while dragging: the row actions would mount and unmount under the pointer, and every
      // DOM insert restyles the whole admin (Payload's `body:has(...)` rules).
      onPointerEnter={() => !runtime.drag.get() && runtime.store.hover(block.id)}
      onPointerLeave={() => !runtime.drag.get() && runtime.store.hover(null)}
      {...listeners}
      {...attributes}
      role="treeitem"
      aria-label={[
        blockSummary(block, typeLabel),
        block.hidden && 'hidden on the site',
        untranslated > 0 && `${untranslated} not translated`,
        ...issues,
      ]
        .filter(Boolean)
        .join(', ')}
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={container && childCount > 0 ? open : undefined}
      aria-roledescription="block"
      tabIndex={selected || focusable ? 0 : -1}
      data-tooltip={`${typeLabel}${tag}${label ? '' : ' · double-click to rename'}`}
      data-tooltip-side="right"
    >
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="builder-editor__guide" style={{ left: 15 + i * OUTLINE_INDENT }} />
      ))}
      <span className="builder-editor__row-indent" style={{ width: depth * OUTLINE_INDENT }} />
      {container && childCount > 0 ? (
        <button
          type="button"
          className="builder-editor__caret"
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={-1}
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation()
            setCollapsed(runtime, block.id, open)
          }}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        </button>
      ) : (
        <span className="builder-editor__caret builder-editor__caret--empty" />
      )}
      <span className="builder-editor__row-icon">
        <BlockIcon name={icon} size={14} />
      </span>
      {renaming ? (
        <RenameInput block={block} placeholder={blockPreview(block) || name} onDone={() => onRename(null)} />
      ) : (
        <>
          <span className="builder-editor__row-type">{name}</span>
          {text && <span className="builder-editor__row-text">{text}</span>}
        </>
      )}
      <PeerDots blockId={block.id} />
      {untranslated > 0 && (
        <span
          className="builder-editor__row-untranslated"
          aria-hidden="true"
          data-tooltip={`${untranslated} ${untranslated === 1 ? 'field is' : 'fields are'} not translated`}
          data-tooltip-side="right"
        />
      )}
      {issues.length > 0 && (
        <span className="builder-editor__row-problem" data-tooltip={issues.join('\n')} data-tooltip-side="right">
          <Icon name="warning" size={13} />
        </span>
      )}
      {bindingCount > 0 && (
        <span
          className={`builder-editor__row-bound${broken ? ' builder-editor__row-bound--broken' : ''}`}
          aria-label={broken ? 'A bound field is missing' : `${bindingCount} bound ${bindingCount === 1 ? 'field' : 'fields'}`}
          data-tooltip-side="right"
          data-tooltip={
            broken
              ? 'A bound field is missing from the collection. Select the block to fix it.'
              : `Shows data: ${Object.entries(block.bindings ?? {})
                  .map(([prop, field]) => `${prop} ← ${field}`)
                  .join(', ')}`
          }
        >
          <Icon name={broken ? 'unlink' : 'bind'} size={12} />
        </span>
      )}
      {!open && childCount > 0 && <span className="builder-editor__row-count">{childCount}</span>}
      {/* CSS shows them on hover only. Rendered for the hovered row only: a large page has hundreds of rows. */}
      {!renaming && hovered && (
        <span className="builder-editor__row-actions">
          {actions.map((action) => (
            <button
              key={action.icon}
              type="button"
              tabIndex={-1}
              className={`builder-editor__row-action${action.danger ? ' builder-editor__row-action--danger' : ''}`}
              aria-label={action.label}
              data-tooltip={`${action.label} · ${keyText(action.keys)}`}
              onPointerDown={stop}
              onClick={(e) => {
                e.stopPropagation()
                action.run()
              }}
            >
              <Icon name={action.icon} size={14} />
            </button>
          ))}
        </span>
      )}
      {block.hidden && (
        <span className="builder-editor__row-hidden" aria-label="Hidden on the site">
          <Icon name="eyeOff" size={14} />
        </span>
      )}
    </div>
  )
})

/**
 * Inline name input for a block. Enter or leaving it saves; Escape cancels. An empty name goes
 * back to the automatic one.
 */
export function RenameInput({
  block,
  placeholder,
  onDone,
  className = 'builder-editor__rename',
}: {
  block: Block
  placeholder: string
  onDone: () => void
  className?: string
}) {
  const runtime = useRuntime()
  const [value, setValue] = useState(block.label ?? '')
  const cancelled = useRef(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className={className}
      aria-label="Block name"
      placeholder={placeholder}
      value={value}
      maxLength={80}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Keys stay in the input: no outline navigation, no editor shortcuts.
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          cancelled.current = true
          e.currentTarget.blur()
        }
      }}
      onBlur={(e) => {
        if (!cancelled.current) renameBlock(runtime, block.id, value)
        onDone()
        // Keyboard users go back to the row they renamed (a click elsewhere keeps its own focus).
        if (e.relatedTarget === null) requestAnimationFrame(() => focusRow(runtime, block.id))
      }}
    />
  )
}
