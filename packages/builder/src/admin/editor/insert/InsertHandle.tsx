'use client'

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/click-events-have-key-events -- a combobox: the search input keeps the focus and handles the keys (arrows, Enter, Escape) for the listbox, which a native select cannot do */

// The canvas "+" button: on the edge between blocks next to the pointer, or inside an empty slot.
// A click opens a small picker (blocks and sections that fit there, searchable, keyboard
// navigable) that inserts at exactly that position. Hidden while dragging and while text is
// edited inline. Lives in the overlay (iframe coordinates).

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { currentPosition, insertBlocks, insertNewBlockAt } from '../actions'
import { BlockIcon, Icon } from '../icons'
import { inlineEditing } from '../inline'
import { useRuntime } from '../runtime'
import { Popover, usePopover } from '../styles/popover'
import { useValue, useValueSelector } from '../valueStore'
import { pickerItems, type PickerItem } from './picker'
import { spotPosition, type InsertSpot } from './spots'

export const InsertHandle = memo(function InsertHandle() {
  const runtime = useRuntime()
  const spot = useValue(runtime.insertSpot)
  const dragging = useValueSelector(runtime.drag, (drag) => drag !== null)
  const locked = useValue(runtime.pointerLock)
  const editing = useValueSelector(inlineEditing(runtime), (inline) => inline !== null)
  const picker = usePopover('auto')
  // The spot under the pointer while it is on the button (the canvas reports "leave" then).
  const [held, setHeld] = useState<InsertSpot | null>(null)
  // The spot the open picker inserts at.
  const [target, setTarget] = useState<InsertSpot | null>(null)
  const shown = picker.open && target ? target : (held ?? spot)
  const visible = Boolean(shown) && (picker.open || (!dragging && !locked && !editing))
  const active = picker.open || held !== null

  return (
    <>
      {visible && shown && (
        <>
          {active && (
            <div
              className={`builder-editor__insert-mark builder-editor__insert-mark--${shown.kind}`}
              style={{ left: shown.rect.x, top: shown.rect.y, width: shown.rect.width, height: shown.rect.height }}
            />
          )}
          <button
            type="button"
            className="builder-editor__insert-plus"
            style={{ left: shown.at.x, top: shown.at.y } as CSSProperties}
            aria-label="Add a block here"
            aria-haspopup="dialog"
            aria-expanded={picker.open}
            data-tooltip={picker.open ? undefined : 'Add here'}
            onPointerEnter={() => setHeld(spot ?? held)}
            onPointerLeave={() => setHeld(null)}
            onClick={(e) => {
              if (picker.open) {
                picker.hide()
                return
              }
              setTarget(shown)
              picker.show(e.currentTarget)
            }}
          >
            <Icon name="plus" size={12} />
          </button>
        </>
      )}
      <Popover {...picker.props} className="builder-editor__menu builder-editor__picker" label="Add a block">
        {picker.open && target && (
          <InsertPicker
            spot={target}
            onDone={() => {
              picker.hide()
              setHeld(null)
            }}
          />
        )}
      </Popover>
    </>
  )
})

function InsertPicker({ spot, onDone }: { spot: InsertSpot; onDone: () => void }) {
  const runtime = useRuntime()
  const saved = useValue(runtime.sections.saved)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void runtime.sections.load()
    inputRef.current?.focus()
  }, [runtime])

  const items = useMemo(
    () =>
      pickerItems({
        blocks: runtime.config.blocks,
        sections: [...(saved ?? []), ...(runtime.config.sections ?? [])],
        layout: runtime.store.getState().layout,
        parentId: spot.parentId,
        slot: spot.slot,
        query,
      }),
    [runtime, saved, spot, query],
  )
  const current = Math.min(active, Math.max(0, items.length - 1))

  const choose = (item: PickerItem | undefined) => {
    if (!item) return
    const to = currentPosition(runtime.store.getState().layout, spotPosition(spot))
    onDone()
    runtime.insertSpot.set(null)
    if (!to) {
      runtime.warn('That place is gone: someone changed the page. Try again.')
      return
    }
    if (item.kind === 'block') {
      insertNewBlockAt(runtime, item.type, to)
      return
    }
    if (insertBlocks(runtime, item.section.blocks, to)) runtime.notify(`Added ${item.section.label}`)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + items.length) % Math.max(1, items.length))
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      setActive(e.key === 'Home' ? 0 : items.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(items[current])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onDone()
    }
  }

  const firstSection = items.findIndex((item) => item.kind === 'section')
  const listId = 'builder-insert-picker-list'
  return (
    <div className="builder-editor__picker-body">
      <label className="builder-editor__search builder-editor__picker-search">
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search blocks and sections"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={items[current] ? `builder-pick-${items[current].id}` : undefined}
          placeholder="Search blocks and sections"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <div id={listId} role="listbox" aria-label="Blocks and sections" className="builder-editor__picker-list">
        {items.length === 0 && (
          <p className="builder-editor__hint builder-editor__hint--center">
            {query.trim() ? `Nothing matches “${query.trim()}”.` : 'No block fits here.'}
          </p>
        )}
        {items.map((item, i) => (
          <PickerRow
            key={item.id}
            item={item}
            selected={i === current}
            heading={i === 0 && item.kind === 'block' ? 'Blocks' : i === firstSection ? 'Sections' : null}
            onPick={() => choose(item)}
            onHover={() => setActive(i)}
          />
        ))}
      </div>
    </div>
  )
}

const scrollIntoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

function PickerRow({
  item,
  selected,
  heading,
  onPick,
  onHover,
}: {
  item: PickerItem
  selected: boolean
  heading: string | null
  onPick: () => void
  onHover: () => void
}) {
  return (
    <>
      {heading && (
        <p className="builder-editor__picker-heading" role="presentation">
          {heading}
        </p>
      )}
      <div
        ref={selected ? scrollIntoView : undefined}
        id={`builder-pick-${item.id}`}
        role="option"
        aria-selected={selected}
        tabIndex={-1}
        className="builder-editor__picker-item"
        // The input keeps the focus.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
        onMouseMove={selected ? undefined : onHover}
      >
        <span className="builder-editor__picker-icon">
          <BlockIcon name={item.icon} size={14} />
        </span>
        <span className="builder-editor__picker-label">{item.label}</span>
        {item.hint && <span className="builder-editor__picker-hint">{item.hint}</span>}
      </div>
    </>
  )
}
