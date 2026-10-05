'use client'

import { useDraggable } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { findBlock, findLocation } from '../../core'
import type { DropIndicator, Rect } from '../../core/types'
import { smoothView } from './dnd/smooth'
import { BlockIcon, Icon } from './icons'
import { inlineEditing } from './inline'
import { InlineToolbar } from './InlineToolbar'
import { InsertHandle } from './insert/InsertHandle'
import { BlockContextMenu, blockMenuEntries } from './menu/blockMenu'
import { MenuButton } from './menu/Menu'
import { blockName } from './names'
import { PeerCursors, PeerSelections } from './live/PresenceUI'
import { shortName } from './live/presence'
import { toRect, useRuntime, type DragData, type DragState } from './runtime'
import { useEditor } from './store'
import { Tooltips } from './tooltip/Tooltips'
import { useValue, useValueSelector } from './valueStore'

/** Height of the label chip and the action bar, in screen pixels. */
const BAR_HEIGHT = 26
/** Below this screen width the action bar would cover the name tag, so it goes under the block. */
const NARROW_BLOCK = 190
/** Height of a name tag, in screen pixels (`.builder-editor__tag`). */
const TAG_HEIGHT = 20

/** Where a name tag sits: above the block, under it, or inside its top left corner. */
type TagPlace = 'above' | 'below' | 'inside'

function box(rect: Rect): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
}

/**
 * The element being edited inline (one list item, a heading), in iframe viewport coordinates.
 * The canvas is same-origin and marks it with `data-builder-editing`. One read per overlay render.
 */
function editedRect(iframe: HTMLIFrameElement | null): Rect | null {
  const el = iframe?.contentDocument?.querySelector('[data-builder-editing]')
  return el ? toRect(el.getBoundingClientRect()) : null
}

/** What the overlay draws of a drag. Changes only when the drop target changes, not on every pointer move. */
type OverlayDrag = { sourceId: string | null; indicator: DropIndicator | null; parentId: string | null } | null

function overlayDrag(drag: DragState | null): OverlayDrag {
  if (!drag) return null
  const indicator = drag.zone === 'canvas' && drag.target && !drag.target.noop ? drag.target.indicator : null
  return {
    sourceId: drag.source.kind === 'block' ? drag.source.id : null,
    indicator,
    parentId: indicator?.kind === 'box' ? (drag.target?.to.parentId ?? null) : null,
  }
}

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

function sameOverlayDrag(a: OverlayDrag, b: OverlayDrag): boolean {
  if (!a || !b) return a === b
  if (a.sourceId !== b.sourceId || a.parentId !== b.parentId) return false
  if (!a.indicator || !b.indicator) return a.indicator === b.indicator
  return a.indicator.kind === b.indicator.kind && sameRect(a.indicator.rect, b.indicator.rect)
}

/**
 * Draws hover, selection, the action bar and the canvas drop indicator over the iframe.
 * Positions use iframe coordinates. The frame may be zoomed out, so chips and bars scale back
 * up by `--be-inv` to keep their screen size.
 */
export function Overlay() {
  const runtime = useRuntime()
  const measurement = useValue(runtime.measurement)
  const drag = useValueSelector(runtime.drag, overlayDrag, sameOverlayDrag)
  // Smooth drag mode: blocks move on the canvas, so the overlay draws the gap instead of a line.
  const smooth = useValue(smoothView(runtime))
  const { zoom } = useValue(runtime.frame)
  const live = useValue(runtime.live)
  const assistantFlash = useValue(runtime.assistantFlash)
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const hoveredId = useEditor(runtime.store, (s) => s.hoveredId)
  // Names and text previews in the editor's locale.
  const layout = useEditor(runtime.store, (s) => s.view)
  const inline = useValue(inlineEditing(runtime))

  const rectOf = (id: string | null) => (id ? measurement?.blocks.find((b) => b.id === id)?.rect : undefined)
  const problems = useValue(runtime.problems)
  const hovered = hoveredId && hoveredId !== selectedId && hoveredId !== inline?.id && !drag ? findBlock(layout, hoveredId) : null
  const hoverRect = rectOf(hovered?.id ?? null)
  // Parent hint: the container around the hovered block, so nesting is easy to read.
  const hoverParentId = hovered ? (findLocation(layout, hovered.id)?.parentId ?? null) : null
  const parentRect = hoverParentId && hoverParentId !== selectedId ? rectOf(hoverParentId) : undefined
  const selected = selectedId ? findBlock(layout, selectedId) : null
  const selectedRect = rectOf(selectedId)
  // The selected block's text is being edited on the canvas: no action bar, an editing outline.
  const editing = Boolean(inline && selected && inline.id === selected.id)
  // While editing, the outline and the toolbar go around the edited text only (one list item, not the list).
  const editRect = (editing ? editedRect(runtime.iframeRef.current) : null) ?? selectedRect
  const sourceRect = !smooth && drag?.sourceId ? rectOf(drag.sourceId) : undefined
  const indicator = smooth ? null : (drag?.indicator ?? null)
  const dropParent = drag?.parentId ? findBlock(layout, drag.parentId) : null
  const scroll = measurement?.scroll
  const gapShift = smooth && scroll ? { x: scroll.x - smooth.baseScroll.x, y: scroll.y - smooth.baseScroll.y } : { x: 0, y: 0 }
  /** A chip fits above a rect when the rect starts lower than the chip height (in iframe pixels). */
  const roomAbove = (rect: Rect) => rect.y * zoom >= BAR_HEIGHT
  /**
   * A tag sits outside the block, so it never covers the block's own first line: above when there is
   * room, else under the block when its bottom edge is in view (and the action bar is not there).
   * Only a block that fills the view from the top keeps the tag inside, at the visible top edge.
   */
  const tagPlace = (rect: Rect, barBelow = false): TagPlace => {
    if (roomAbove(rect)) return 'above'
    const viewportHeight = measurement?.viewport.height
    const bottomInView = viewportHeight !== undefined && (rect.y + rect.height) * zoom + TAG_HEIGHT <= viewportHeight * zoom
    return bottomInView && !barBelow ? 'below' : 'inside'
  }
  /** Class and style of a name tag. `modifier` adds a `builder-editor__tag--<modifier>` class. */
  const tagProps = (rect: Rect, modifier?: string, barBelow = false) => {
    const place = tagPlace(rect, barBelow)
    const classes = ['builder-editor__tag', modifier && `builder-editor__tag--${modifier}`, place !== 'above' && `builder-editor__tag--${place}`]
    // A block scrolled up past the view keeps its tag at the top of the view.
    const style: CSSProperties | undefined =
      place === 'inside' && rect.y < 0 ? { top: Math.min(-rect.y, Math.max(0, rect.height - TAG_HEIGHT / zoom)) } : undefined
    return { className: classes.filter(Boolean).join(' '), style }
  }
  const taggedActors = new Set<string>()

  return (
    <div className="builder-editor__overlay">
      {!drag &&
        problems.map((problem, i) => {
          const rect = rectOf(problem.blockId)
          if (!rect) return null
          return (
            // oxlint-disable-next-line react/no-array-index-key -- problems have no id; the list is replaced as a whole
            <div key={`${problem.blockId}:${i}`} className="builder-editor__problem-box" style={box(rect)}>
              <span className="builder-editor__problem-tag" data-tooltip={problem.message}>
                <Icon name="warning" size={12} />
                {problem.message}
              </span>
            </div>
          )
        })}
      {parentRect && <div className="builder-editor__parent-hint" style={box(parentRect)} />}
      {smooth?.placeholder && (
        // The outer box follows the canvas scroll at once; the gap inside glides to each new place.
        <div className="builder-dnd-scroll" style={{ transform: `translate3d(${-gapShift.x}px, ${-gapShift.y}px, 0)` }}>
          <div
            className="builder-dnd-gap"
            data-settle={smooth.phase === 'settle' || undefined}
            style={{
              transform: `translate3d(${smooth.placeholder.x}px, ${smooth.placeholder.y}px, 0)`,
              width: smooth.placeholder.width,
              height: smooth.placeholder.height,
            }}
          >
            {/* Always mounted: inserting nodes restyles the whole admin (Payload's `body:has(...)` rules). */}
            <span className="builder-editor__drop-label builder-dnd-gap__label" hidden={!smooth.into} data-label={smooth.into ? `Into ${smooth.into}` : ''}>
              <Icon name="plus" size={12} />
            </span>
          </div>
        </div>
      )}
      {hovered && hoverRect && (
        <div className="builder-editor__hover" style={box(hoverRect)}>
          <span {...tagProps(hoverRect, 'hover')}>
            <BlockIcon name={runtime.blockIcon(hovered.type)} size={12} />
            {blockName(hovered, runtime.blockLabel(hovered.type))}
          </span>
        </div>
      )}
      {sourceRect && <div className="builder-editor__source" style={box(sourceRect)} />}
      {selected && selectedRect && (
        <>
          <div
            hidden={Boolean(smooth)}
            className={`builder-editor__selection${selected.hidden ? ' builder-editor__selection--hidden' : ''}${editing ? ' builder-editor__selection--editing' : ''}`}
            style={box(editing && editRect ? editRect : selectedRect)}
          >
            {editing && editRect && inline?.kind !== 'rich' && (
              <span {...tagProps(editRect, 'editing')}>
                <Icon name="rename" size={12} />
                Editing text · Esc to finish
              </span>
            )}
            {!drag && !editing && (
              <span {...tagProps(selectedRect, undefined, selectedRect.width * zoom < NARROW_BLOCK)}>
                <BlockIcon name={runtime.blockIcon(selected.type)} size={12} />
                {blockName(selected, runtime.blockLabel(selected.type))}
                {selected.bindings && Object.keys(selected.bindings).length > 0 && (
                  <span className="builder-editor__tag-bound" data-tooltip="Shows data from a document">
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
            parentId={findLocation(layout, selected.id)?.parentId ?? null}
            rect={selectedRect}
            inside={!roomAbove(selectedRect)}
            below={selectedRect.width * zoom < NARROW_BLOCK}
            hidden={Boolean(drag) || Boolean(smooth) || editing}
          />
          {editing && editRect && inline?.kind === 'rich' && <InlineToolbar inline={inline} rect={editRect} zoom={zoom} />}
        </>
      )}
      <InsertHandle />
      <BlockContextMenu />
      <Tooltips />
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
              <span {...tagProps(rect, 'remote')}>
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
              <span {...tagProps(rect, 'remote')}>
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

type ActionBarProps = {
  id: string
  label: string
  icon: string
  parentId: string | null
  rect: Rect
  /** Draw inside the selection (no room above it). */
  inside: boolean
  /** Draw under the selection: the block is too narrow for the bar and the name tag side by side. */
  below: boolean
  /** Hidden but mounted, e.g. while dragging. */
  hidden: boolean
}

/** The bar on the selected block: drag, select parent, and a menu with the other actions. */
function ActionBar({ id, label, icon, parentId, rect, inside, below, hidden }: ActionBarProps) {
  const runtime = useRuntime()
  const data: DragData = { source: { kind: 'block', id }, label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `canvas:${id}`, data })

  const place = below ? 'below' : inside ? 'inside' : 'above'
  const visibility = hidden ? 'hidden' : undefined
  const style: CSSProperties =
    place === 'below' ? { left: rect.x, top: rect.y + rect.height, visibility } : { left: rect.x + rect.width, top: rect.y, visibility }

  return (
    <div className={`builder-editor__actions builder-editor__actions--${place}`} style={style}>
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
      <button
        type="button"
        className="builder-editor__action"
        aria-label="Select the parent block"
        data-tooltip="Select parent"
        disabled={!parentId}
        onClick={() => parentId && runtime.store.select(parentId)}
      >
        <Icon name="parent" size={14} />
      </button>
      <MenuButton
        className="builder-editor__action"
        triggerLabel="More block actions"
        tooltip="More actions"
        label="Block actions"
        items={() => blockMenuEntries(runtime, id, 'canvas')}
      >
        <Icon name="more" size={14} />
      </MenuButton>
    </div>
  )
}
