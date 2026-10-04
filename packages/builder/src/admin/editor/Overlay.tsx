'use client'

import { useDraggable } from '@dnd-kit/core'
import type { CSSProperties } from 'react'

import { findBlock, findLocation } from '../../core'
import type { CanvasMeasurement, Layout, Rect } from '../../core/types'
import { copySelection, duplicateBlock, moveBy, removeBlock, toggleHidden } from './actions'
import { BlockIcon, Icon, type IconName } from './icons'
import { blockName } from './names'
import { Popover, usePopover } from './styles/popover'
import { PeerCursors, PeerSelections } from './live/PresenceUI'
import { shortName } from './live/presence'
import { useRuntime, type DragData } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

/** Height of the label chip and the action bar, in screen pixels. */
const BAR_HEIGHT = 26
/** Below this screen width the action bar would cover the name tag, so it goes under the block. */
const NARROW_BLOCK = 190

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
  const problems = useValue(runtime.problems)
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
      {!drag &&
        problems.map((problem, i) => {
          const rect = rectOf(problem.blockId)
          if (!rect) return null
          return (
            // oxlint-disable-next-line react/no-array-index-key -- problems have no id; the list is replaced as a whole
            <div key={`${problem.blockId}:${i}`} className="builder-editor__problem-box" style={box(rect)}>
              <span className="builder-editor__problem-tag" title={problem.message}>
                <Icon name="warning" size={12} />
                {problem.message}
              </span>
            </div>
          )
        })}
      {parentRect && <div className="builder-editor__parent-hint" style={box(parentRect)} />}
      {hovered && hoverRect && (
        <div className="builder-editor__hover" style={box(hoverRect)}>
          <span className={`builder-editor__tag builder-editor__tag--hover${roomAbove(hoverRect) ? '' : ' builder-editor__tag--inside'}`}>
            <BlockIcon name={runtime.blockIcon(hovered.type)} size={12} />
            {blockName(hovered, runtime.blockLabel(hovered.type))}
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
                {blockName(selected, runtime.blockLabel(selected.type))}
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
            measurement={measurement}
            inside={!roomAbove(selectedRect)}
            below={selectedRect.width * zoom < NARROW_BLOCK}
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
  measurement: CanvasMeasurement | null
  /** Draw inside the selection (no room above it). */
  inside: boolean
  /** Draw under the selection: the block is too narrow for the bar and the name tag side by side. */
  below: boolean
  /** Hidden but mounted, e.g. while dragging. */
  hidden: boolean
}

/** True when the block's siblings sit side by side (a row), so "move" means left and right. */
function inRow(layout: Layout, measurement: CanvasMeasurement | null, id: string): boolean {
  const location = findLocation(layout, id)
  if (!location || !measurement) return false
  const list = location.parentId === null ? layout.blocks : (findBlock(layout, location.parentId)?.slots?.[location.slot] ?? [])
  const neighbor = list[location.index + 1] ?? list[location.index - 1]
  const rectOf = (blockId: string | undefined) => measurement.blocks.find((b) => b.id === blockId)?.rect
  const a = rectOf(id)
  const b = rectOf(neighbor?.id)
  if (!a || !b) return false
  return Math.abs(a.y - b.y) < Math.min(a.height, b.height) / 2 && Math.abs(a.x - b.x) > 1
}

type MenuEntry = { icon: IconName; label: string; keys?: string; disabled?: boolean; danger?: boolean; run: () => void } | 'separator'

/** The bar on the selected block: drag, select parent, and a menu with the other actions. */
function ActionBar({ id, label, icon, layout, rect, measurement, inside, below, hidden }: ActionBarProps) {
  const runtime = useRuntime()
  const menu = usePopover('auto')
  const location = findLocation(layout, id)
  const siblings = location ? siblingCount(layout, location.parentId, location.slot) : 0
  const block = findBlock(layout, id)
  const data: DragData = { source: { kind: 'block', id }, label, icon }
  const { setNodeRef, listeners, attributes } = useDraggable({ id: `canvas:${id}`, data })
  const row = inRow(layout, measurement, id)

  const place = below ? 'below' : inside ? 'inside' : 'above'
  const visibility = hidden ? 'hidden' : undefined
  const style: CSSProperties =
    place === 'below' ? { left: rect.x, top: rect.y + rect.height, visibility } : { left: rect.x + rect.width, top: rect.y, visibility }

  const items: MenuEntry[] = [
    { icon: row ? 'left' : 'up', label: row ? 'Move left' : 'Move up', disabled: !location || location.index === 0, run: () => moveBy(runtime, id, -1) },
    {
      icon: row ? 'right' : 'down',
      label: row ? 'Move right' : 'Move down',
      disabled: !location || location.index >= siblings - 1,
      run: () => moveBy(runtime, id, 1),
    },
    'separator',
    { icon: 'duplicate', label: 'Duplicate', keys: 'Ctrl+D', run: () => duplicateBlock(runtime, id) },
    { icon: 'copy', label: 'Copy', keys: 'Ctrl+C', run: () => copySelection(runtime) },
    { icon: block?.hidden ? 'eye' : 'eyeOff', label: block?.hidden ? 'Show on the site' : 'Hide on the site', run: () => toggleHidden(runtime, id) },
    'separator',
    { icon: 'delete', label: 'Delete', keys: 'Del', danger: true, run: () => removeBlock(runtime, id) },
  ]

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
        disabled={!location?.parentId}
        onClick={() => location?.parentId && runtime.store.select(location.parentId)}
      >
        <Icon name="parent" size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__action"
        aria-label="More block actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        data-tooltip="More actions"
        onClick={(e) => menu.toggle(e.currentTarget)}
      >
        <Icon name="more" size={14} />
      </button>
      <Popover {...menu.props} className="builder-editor__menu" label="Block actions">
        <div role="menu">
          {items.map((item, i) =>
            item === 'separator' ? (
              // oxlint-disable-next-line react/no-array-index-key -- separators have no identity
              <hr key={`sep-${i}`} className="builder-bar__menu-sep" />
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`builder-editor__menu-item${item.danger ? ' builder-editor__menu-item--danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  menu.hide()
                  item.run()
                }}
              >
                <Icon name={item.icon} size={14} />
                {item.label}
                {item.keys && <kbd className="builder-editor__menu-keys">{item.keys}</kbd>}
              </button>
            ),
          )}
        </div>
      </Popover>
    </div>
  )
}
