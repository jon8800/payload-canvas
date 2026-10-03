'use client'

import { useDraggable } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { createId, findBlock, findLocation } from '../../core'
import type { Layout, Rect } from '../../core/types'
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, GripIcon, ParentIcon, TrashIcon } from './icons'
import { useRuntime, type DragData } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

const BAR_HEIGHT = 28

function box(rect: Rect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
}

/** Draws hover, selection, the action bar and the canvas drop indicator over the iframe. */
export function Overlay() {
  const runtime = useRuntime()
  const measurement = useValue(runtime.measurement)
  const drag = useValue(runtime.drag)
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const hoveredId = useEditor(runtime.store, (s) => s.hoveredId)
  const layout = useEditor(runtime.store, (s) => s.layout)

  const rectOf = (id: string | null) => (id ? measurement?.blocks.find((b) => b.id === id)?.rect : undefined)
  const hovered = hoveredId && hoveredId !== selectedId && !drag ? findBlock(layout, hoveredId) : null
  const hoverRect = rectOf(hovered?.id ?? null)
  const selected = selectedId ? findBlock(layout, selectedId) : null
  const selectedRect = rectOf(selectedId)
  const sourceRect = drag?.source.kind === 'block' ? rectOf(drag.source.id) : undefined
  const indicator = drag?.zone === 'canvas' && drag.target && !drag.target.noop ? drag.target.indicator : null

  return (
    <div className="builder-editor__overlay">
      {hovered && hoverRect && (
        <div className="builder-editor__hover" style={box(hoverRect)}>
          <span className="builder-editor__tag builder-editor__tag--hover">{runtime.blockLabel(hovered.type)}</span>
        </div>
      )}
      {sourceRect && <div className="builder-editor__source" style={box(sourceRect)} />}
      {selected && selectedRect && (
        <>
          <div className="builder-editor__selection" style={box(selectedRect)}>
            <span className="builder-editor__tag" style={selectedRect.y < BAR_HEIGHT ? { top: 0 } : undefined}>
              {runtime.blockLabel(selected.type)}
            </span>
          </div>
          {/* Stays mounted while dragging: its grip may be the active draggable. */}
          <ActionBar id={selected.id} label={runtime.blockLabel(selected.type)} layout={layout} rect={selectedRect} />

        </>
      )}
      {indicator && (
        <div className={`builder-editor__drop builder-editor__drop--${indicator.kind}`} style={box(indicator.rect)} />
      )}
    </div>
  )
}

function siblingCount(layout: Layout, parentId: string | null, slot: string): number {
  if (parentId === null) return layout.blocks.length
  return findBlock(layout, parentId)?.slots?.[slot]?.length ?? 0
}

function ActionBar({ id, label, layout, rect }: { id: string; label: string; layout: Layout; rect: Rect }) {
  const runtime = useRuntime()
  const location = findLocation(layout, id)
  const siblings = location ? siblingCount(layout, location.parentId, location.slot) : 0
  const data: DragData = { source: { kind: 'block', id }, label }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `canvas:${id}`, data })

  const moveBy = (delta: number) => {
    if (!location) return
    runtime.store.apply({
      type: 'move',
      id,
      to: { parentId: location.parentId, slot: location.slot, index: location.index + delta },
    })
  }

  const duplicate = () => {
    const newId = createId()
    runtime.store.apply({ type: 'duplicate', id, newId }, { select: newId })
  }

  // Above the selection, or inside it when there is no room at the top of the canvas.
  const style: CSSProperties = {
    left: rect.x + rect.width,
    top: rect.y < BAR_HEIGHT ? rect.y : rect.y - BAR_HEIGHT,
  }

  return (
    <div className="builder-editor__actions" style={style}>
      <button
        ref={setNodeRef}
        type="button"
        className="builder-editor__action builder-editor__handle"
        title="Drag to move"
        {...listeners}
        {...attributes}
      >
        <GripIcon size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__action"
        title="Select parent"
        disabled={!location?.parentId}
        onClick={() => location?.parentId && runtime.store.select(location.parentId)}
      >
        <ParentIcon size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__action"
        title="Move up"
        disabled={!location || location.index === 0}
        onClick={() => moveBy(-1)}
      >
        <ArrowUpIcon size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__action"
        title="Move down"
        disabled={!location || location.index >= siblings - 1}
        onClick={() => moveBy(1)}
      >
        <ArrowDownIcon size={14} />
      </button>
      <button type="button" className="builder-editor__action" title="Duplicate" onClick={duplicate}>
        <CopyIcon size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__action"
        title="Delete"
        onClick={() => runtime.store.apply({ type: 'remove', id }, { select: null })}
      >
        <TrashIcon size={14} />
      </button>
    </div>
  )
}
