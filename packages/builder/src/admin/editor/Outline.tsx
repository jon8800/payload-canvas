'use client'

import { useDraggable } from '@dnd-kit/core'
import { useEffect, useMemo, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'

import { findLocation, getBlockDefinition, slotNames, walkBlocks } from '../../core'
import type { Block, Layout } from '../../core/types'
import { ancestors, duplicateBlock, removeBlock, toggleHidden } from './actions'
import { BlockIcon, Icon, type IconName } from './icons'
import { OUTLINE_INDENT, useRuntime, type DragData, type Runtime } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

type Row = { block: Block; depth: number; container: boolean; open: boolean; childCount: number }

function childrenOf(block: Block): Block[] {
  return Object.values(block.slots ?? {}).flat()
}

/** Visible rows, depth first. Children of collapsed containers are left out. */
function visibleRows(runtime: Runtime, layout: Layout, collapsed: ReadonlySet<string>): Row[] {
  const out: Row[] = []
  const visit = (blocks: Block[], depth: number) => {
    for (const block of blocks) {
      const container = slotNames(getBlockDefinition(runtime.config.blocks, block.type)).length > 0
      const children = childrenOf(block)
      const open = !collapsed.has(block.id)
      out.push({ block, depth, container, open, childCount: children.length })
      if (open) visit(children, depth + 1)
    }
  }
  visit(layout.blocks, 0)
  return out
}

/** First text found in Lexical rich text JSON. */
function lexicalText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const { text, children, root } = node as { text?: unknown; children?: unknown; root?: unknown }
  if (typeof text === 'string' && text.trim()) return text
  if (root) return lexicalText(root)
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = lexicalText(child)
      if (found) return found
    }
  }
  return ''
}

function linkText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  const { url } = value as { url?: unknown }
  return typeof url === 'string' ? url : ''
}

/** A short text from the block's content, so rows are easy to tell apart. */
export function blockPreview(block: Block): string {
  const props = block.props ?? {}
  const str = (key: string) => (typeof props[key] === 'string' ? (props[key] as string).trim() : '')
  switch (block.type) {
    case 'richText':
      return lexicalText(props.content)
    case 'list': {
      const items = Array.isArray(props.items) ? (props.items as { text?: unknown }[]) : []
      const first = items.find((item) => typeof item?.text === 'string')
      return first ? `${String(first.text)}${items.length > 1 ? ` +${items.length - 1}` : ''}` : ''
    }
    case 'stack':
      return str('as') && str('as') !== 'div' ? `<${str('as')}>` : ''
    case 'link': {
      const label = childrenOf(block).map(blockPreview).find(Boolean)
      return label || linkText(props.link)
    }
    case 'video':
      return str('url')
    default:
      return str('text') || str('label') || str('quote') || str('title') || str('alt')
  }
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

/** The outline tree. Rows stay a flat list, which keeps them simple to measure for drop targets. */
export function Outline() {
  const runtime = useRuntime()
  const { store, outlineRef } = runtime
  const layout = useEditor(store, (s) => s.layout)
  const selectedId = useEditor(store, (s) => s.selectedId)
  const collapsed = useValue(runtime.collapsed)
  const rows = useMemo(() => visibleRows(runtime, layout, collapsed), [runtime, layout, collapsed])
  const total = useMemo(() => countBlocks(layout), [layout])

  // A block selected on the canvas opens its collapsed ancestors and scrolls into view.
  useEffect(() => {
    if (!selectedId) return
    const closed = ancestors(store.getState().layout, selectedId)
      .slice(0, -1)
      .filter((b) => runtime.collapsed.get().has(b.id))
    if (closed.length > 0) {
      const next = new Set(runtime.collapsed.get())
      for (const b of closed) next.delete(b.id)
      runtime.collapsed.set(next)
    }
    const frame = requestAnimationFrame(() => {
      outlineRef.current
        ?.querySelector(`[data-outline-row="${CSS.escape(selectedId)}"]`)
        ?.scrollIntoView({ block: 'nearest' })
    })
    return () => cancelAnimationFrame(frame)
  }, [selectedId, runtime, store, outlineRef])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLButtonElement && !e.target.dataset.outlineRow) return
    const index = rows.findIndex((r) => r.block.id === selectedId)
    const row = rows[index]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        selectRow(runtime, index < 0 ? rows[0] : rows[index + 1])
        return
      case 'ArrowUp':
        e.preventDefault()
        selectRow(runtime, index < 0 ? rows.at(-1) : rows[Math.max(0, index - 1)])
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
      case 'Enter': {
        if (!row) return
        e.preventDefault()
        const input = runtime.inspectorRef.current?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, [contenteditable="true"], select',
        )
        input?.focus()
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
      {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard navigation for the tree rows */}
      <div ref={outlineRef} className="builder-editor__outline" role="tree" aria-label="Outline" tabIndex={-1} onKeyDown={onKeyDown}>
        {rows.length === 0 ? (
          <div className="builder-editor__empty">
            <Icon name="layers" size={20} />
            <p>The page is empty.</p>
            <p className="builder-editor__hint">Drag a block or a section here or onto the canvas. A click adds it too.</p>
          </div>
        ) : (
          rows.map((row) => <OutlineRow key={row.block.id} row={row} />)
        )}
      </div>
    </div>
  )
}

/** Inline actions must not start a drag or select the row. */
const stop = (e: ReactPointerEvent) => e.stopPropagation()

function OutlineRow({ row }: { row: Row }) {
  const { block, depth, container, open, childCount } = row
  const runtime = useRuntime()
  const selected = useEditor(runtime.store, (s) => s.selectedId === block.id)
  const hovered = useEditor(runtime.store, (s) => s.hoveredId === block.id)
  const drag = useValue(runtime.drag)
  const label = runtime.blockLabel(block.type)
  const icon = runtime.blockIcon(block.type)
  const data: DragData = { source: { kind: 'block', id: block.id }, label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `outline:${block.id}`, data })
  const dragging = drag?.source.kind === 'block' && drag.source.id === block.id
  const text = blockPreview(block)

  const className = [
    'builder-editor__row',
    selected && 'builder-editor__row--selected',
    hovered && 'builder-editor__row--hovered',
    dragging && 'builder-editor__row--dragging',
    block.hidden && 'builder-editor__row--hidden',
  ]
    .filter(Boolean)
    .join(' ')

  const actions: { icon: IconName; tip: string; run: () => void; danger?: boolean }[] = [
    { icon: block.hidden ? 'eye' : 'eyeOff', tip: block.hidden ? 'Show on the site' : 'Hide on the site', run: () => toggleHidden(runtime, block.id) },
    { icon: 'duplicate', tip: 'Duplicate', run: () => duplicateBlock(runtime, block.id) },
    { icon: 'delete', tip: 'Delete', run: () => removeBlock(runtime, block.id), danger: true },
  ]

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events -- the tree handles the keyboard (arrows, Enter)
    <div
      ref={setNodeRef}
      data-outline-row={block.id}
      data-depth={depth}
      className={className}
      onClick={() => runtime.store.select(block.id)}
      onPointerEnter={() => runtime.store.hover(block.id)}
      onPointerLeave={() => runtime.store.hover(null)}
      {...listeners}
      {...attributes}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={container ? open : undefined}
      aria-roledescription="block"
      tabIndex={selected ? 0 : -1}
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
      <span className="builder-editor__row-type">{label}</span>
      {text && <span className="builder-editor__row-text">{text}</span>}
      {!open && childCount > 0 && <span className="builder-editor__row-count">{childCount}</span>}
      <span className="builder-editor__row-actions">
        {actions.map((action) => (
          <button
            key={action.tip}
            type="button"
            tabIndex={-1}
            className={`builder-editor__row-action${action.danger ? ' builder-editor__row-action--danger' : ''}`}
            aria-label={action.tip}
            title={action.tip}
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
      {block.hidden && (
        <span className="builder-editor__row-hidden" aria-label="Hidden on the site">
          <Icon name="eyeOff" size={14} />
        </span>
      )}
    </div>
  )
}
