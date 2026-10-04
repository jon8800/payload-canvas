'use client'

import { useDraggable } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { findBlock, findLocation } from '../../core'
import type { Layout, Rect } from '../../core/types'
import { duplicateBlock, moveBy, removeBlock } from './actions'
import { BlockIcon, Icon, type IconName } from './icons'
import { PeerCursors, PeerSelections } from './live/PresenceUI'
import { shortName } from './live/presence'
import { useRuntime, type DragData } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

/** Height of the label chip and the action bar, in screen pixels. */
const BAR_HEIGHT = 26

function box(rect: Rect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
}

/**
 * Draws hover, selection, the action bar and the canvas drop indicator over the iframe.
 * Positions use iframe coordinates. The frame may be zoomed out, so chips and bars scale back
 * up by `--be-inv` to keep their screen size.
 */
export function Overlay() {
  const runtime = useRuntime()
  const measurement = useValue(runtime.measurement)
  const drag = useValue(runtime.drag)
  const { zoom } = useValue(runtime.frame)
  const live = useValue(runtime.live)
  const assistantFlash = useValue(runtime.assistantFlash)
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const hoveredId = useEditor(runtime.store, (s) => s.hoveredId)
  const layout = useEditor(runtime.store, (s) => s.layout)

  const rectOf = (id: string | null) => (id ? measurement?.blocks.find((b) => b.id === id)?.rect : undefined)
  const hovered = hoveredId && hoveredId !== selectedId && !drag ? findBlock(layout, hoveredId) : null
  const hoverRect = rectOf(hovered?.id ?? null)
  // Parent hint: the container around the hovered block, so nesting is easy to read.
  const hoverParentId = hovered ? (findLocation(layout, hovered.id)?.parentId ?? null) : null
  const parentRect = hoverParentId && hoverParentId !== selectedId ? rectOf(hoverParentId) : undefined
  const selected = selectedId ? findBlock(layout, selectedId) : null
  const selectedRect = rectOf(selectedId)
  const sourceRect = drag?.source.kind === 'block' ? rectOf(drag.source.id) : undefined
  const indicator = drag?.zone === 'canvas' && drag.target && !drag.target.noop ? drag.target.indicator : null
  const dropParent = indicator?.kind === 'box' && drag?.target?.to.parentId ? findBlock(layout, drag.target.to.parentId) : null
  /** A chip fits above a rect when the rect starts lower than the chip height (in iframe pixels). */
  const roomAbove = (rect: Rect) => rect.y * zoom >= BAR_HEIGHT
  const taggedActors = new Set<string>()

  return (
    <div className="builder-editor__overlay">
      {parentRect && <div className="builder-editor__parent-hint" style={box(parentRect)} />}
      {hovered && hoverRect && (
        <div className="builder-editor__hover" style={box(hoverRect)}>
          <span className={`builder-editor__tag builder-editor__tag--hover${roomAbove(hoverRect) ? '' : ' builder-editor__tag--inside'}`}>
            <BlockIcon name={runtime.blockIcon(hovered.type)} size={12} />
            {runtime.blockLabel(hovered.type)}
          </span>
        </div>
      )}
      {sourceRect && <div className="builder-editor__source" style={box(sourceRect)} />}
      {selected && selectedRect && (
        <>
          <div className={`builder-editor__selection${selected.hidden ? ' builder-editor__selection--hidden' : ''}`} style={box(selectedRect)}>
            {!drag && (
              <span className={`builder-editor__tag${roomAbove(selectedRect) ? '' : ' builder-editor__tag--inside'}`}>
                <BlockIcon name={runtime.blockIcon(selected.type)} size={12} />
                {runtime.blockLabel(selected.type)}
                {selected.bindings && Object.keys(selected.bindings).length > 0 && (
                  <span className="builder-editor__tag-bound" title="Shows data from a document">
                    <Icon name="bind" size={11} />
                  </span>
                )}
                {selected.hidden && <Icon name="eyeOff" size={12} />}
              </span>
            )}
          </div>
          {/* Stays mounted while dragging: its grip may be the active draggable. */}
          <ActionBar
            id={selected.id}
            label={runtime.blockLabel(selected.type)}
            icon={runtime.blockIcon(selected.type)}
            layout={layout}
            rect={selectedRect}
            inside={!roomAbove(selectedRect)}
            hidden={Boolean(drag)}
          />
        </>
      )}
      <PeerCursors />
      {indicator && (
        <div className={`builder-editor__drop builder-editor__drop--${indicator.kind}`} style={box(indicator.rect)}>
          {dropParent && (
            <span className="builder-editor__drop-label">
              <Icon name="plus" size={12} /> Into {runtime.blockLabel(dropParent.type)}
            </span>
          )}
        </div>
      )}
      <PeerSelections />
      {[...(live?.changes ?? [])].map(([id, change]) => {
        const rect = rectOf(id)
        if (!rect) return null
        // One name tag per author: on the first block of their change.
        const tagged = !taggedActors.has(change.actor.label)
        taggedActors.add(change.actor.label)
        return (
          <div
            key={`${id}:${change.at}`}
            className="builder-editor__remote"
            style={{ ...box(rect), '--be-remote': change.color } as CSSProperties}
          >
            {tagged && (
              <span className={`builder-editor__tag builder-editor__tag--remote${roomAbove(rect) ? '' : ' builder-editor__tag--inside'}`}>
                <Icon name={change.actor.type === 'ai' ? 'sparkle' : 'user'} size={12} />
                {shortName(change.actor.label)}
              </span>
            )}
          </div>
        )
      })}
      {[...assistantFlash].flatMap(([id, at]) => {
        const rect = rectOf(id)
        return rect ? [{ id, at, rect }] : []
      }).map(({ id, at, rect }, i) => {
        return (
          // The time in the key restarts the flash when the assistant changes the block again.
          <div key={`${id}:${at}`} className="builder-editor__remote builder-editor__remote--assistant" style={box(rect)}>
            {i === 0 && (
              <span className={`builder-editor__tag builder-editor__tag--remote${roomAbove(rect) ? '' : ' builder-editor__tag--inside'}`}>
                <Icon name="sparkle" size={12} />
                Assistant
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function siblingCount(layout: Layout, parentId: string | null, slot: string): number {
  if (parentId === null) return layout.blocks.length
  return findBlock(layout, parentId)?.slots?.[slot]?.length ?? 0
}

type ActionBarProps = {
  id: string
  label: string
  icon: string
  layout: Layout
  rect: Rect
  /** Draw inside the selection (no room above it). */
  inside: boolean
  /** Hidden but mounted, e.g. while dragging. */
  hidden: boolean
}

function ActionBar({ id, label, icon, layout, rect, inside, hidden }: ActionBarProps) {
  const runtime = useRuntime()
  const location = findLocation(layout, id)
  const siblings = location ? siblingCount(layout, location.parentId, location.slot) : 0
  const data: DragData = { source: { kind: 'block', id }, label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `canvas:${id}`, data })

  const style: CSSProperties = { left: rect.x + rect.width, top: rect.y, visibility: hidden ? 'hidden' : undefined }

  const actions: { icon: IconName; tip: string; disabled?: boolean; run: () => void }[] = [
    {
      icon: 'parent',
      tip: 'Select parent',
      disabled: !location?.parentId,
      run: () => location?.parentId && runtime.store.select(location.parentId),
    },
    { icon: 'up', tip: 'Move up', disabled: !location || location.index === 0, run: () => moveBy(runtime, id, -1) },
    {
      icon: 'down',
      tip: 'Move down',
      disabled: !location || location.index >= siblings - 1,
      run: () => moveBy(runtime, id, 1),
    },
    { icon: 'duplicate', tip: 'Duplicate · Ctrl+D', run: () => duplicateBlock(runtime, id) },
    { icon: 'delete', tip: 'Delete · Del', run: () => removeBlock(runtime, id) },
  ]

  return (
    <div className={`builder-editor__actions${inside ? ' builder-editor__actions--inside' : ''}`} style={style}>
      <button
        ref={setNodeRef}
        type="button"
        className="builder-editor__action builder-editor__handle"
        aria-label="Drag to move"
        data-tooltip="Drag to move"
        {...listeners}
        {...attributes}
      >
        <Icon name="drag" size={14} />
      </button>
      <span className="builder-editor__actions-sep" />
      {actions.map((action) => (
        <button
          key={action.icon}
          type="button"
          className={`builder-editor__action${action.icon === 'delete' ? ' builder-editor__action--danger' : ''}`}
          aria-label={action.tip}
          data-tooltip={action.tip}
          disabled={action.disabled}
          onClick={action.run}
        >
          <Icon name={action.icon} size={14} />
        </button>
      ))}
    </div>
  )
}
