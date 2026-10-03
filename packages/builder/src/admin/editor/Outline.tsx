'use client'

import { useDraggable } from '@dnd-kit/core'

import type { Block } from '../../core/types'
import { OUTLINE_INDENT, useRuntime, type DragData } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

type Row = { block: Block; depth: number }

function flatten(blocks: Block[], depth = 0, out: Row[] = []): Row[] {
  for (const block of blocks) {
    out.push({ block, depth })
    for (const children of Object.values(block.slots ?? {})) flatten(children, depth + 1, out)
  }
  return out
}

const PREVIEW_KEYS = ['text', 'label', 'title', 'alt']

/** A short text from the block's props (text, label, title, alt), so rows are easy to tell apart. */
function preview(block: Block): string {
  for (const key of PREVIEW_KEYS) {
    const value = block.props?.[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

/** Flat list of indented rows. Flat rows are simple to measure for drop targets. */
export function Outline() {
  const { store, outlineRef } = useRuntime()
  const layout = useEditor(store, (s) => s.layout)
  const rows = flatten(layout.blocks)

  return (
    <div className="builder-editor__panel builder-editor__panel--grow">
      <h3 className="builder-editor__panel-title">Outline</h3>
      <div ref={outlineRef} className="builder-editor__outline">
        {rows.length === 0 && <p className="builder-editor__hint">No blocks yet. Drag one from the library.</p>}
        {rows.map(({ block, depth }) => (
          <OutlineRow key={block.id} block={block} depth={depth} />
        ))}
      </div>
    </div>
  )
}

function OutlineRow({ block, depth }: { block: Block; depth: number }) {
  const runtime = useRuntime()
  const selected = useEditor(runtime.store, (s) => s.selectedId === block.id)
  const hovered = useEditor(runtime.store, (s) => s.hoveredId === block.id)
  const drag = useValue(runtime.drag)
  const label = runtime.blockLabel(block.type)
  const data: DragData = { source: { kind: 'block', id: block.id }, label }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `outline:${block.id}`, data })
  const dragging = drag?.source.kind === 'block' && drag.source.id === block.id

  const className = [
    'builder-editor__row',
    selected && 'builder-editor__row--selected',
    hovered && 'builder-editor__row--hovered',
    dragging && 'builder-editor__row--dragging',
    block.hidden && 'builder-editor__row--hidden',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={setNodeRef}
      type="button"
      data-outline-row={block.id}
      data-depth={depth}
      className={className}
      style={{ paddingLeft: 8 + depth * OUTLINE_INDENT }}
      onClick={() => runtime.store.select(block.id)}
      onPointerEnter={() => runtime.store.hover(block.id)}
      onPointerLeave={() => runtime.store.hover(null)}
      {...listeners}
      {...attributes}
    >
      <span className="builder-editor__row-type">{label}</span>
      <span className="builder-editor__row-text">{preview(block)}</span>
    </button>
  )
}
