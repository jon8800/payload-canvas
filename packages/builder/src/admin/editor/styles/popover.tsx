'use client'

// Popovers in the browser's top layer (the `popover` attribute), so the scrolling inspector
// never clips them. Placed under (or above) their anchor with fixed coordinates.
//
// For a list of actions, use `MenuButton` from `../menu/Menu` instead: it adds keyboard
// navigation. This hook is for popovers with their own content (pickers, forms, combobox lists).

/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- a native select cannot be a combobox popup, so the list uses listbox/option roles */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react'

import { onDismissMenus } from '../menu/dismiss'

const GAP = 4
const MARGIN = 8
/** A click on the anchor this soon after a press on it closed the popover keeps it closed. */
const REOPEN_MS = 600

function place(el: HTMLElement, anchor: HTMLElement, matchWidth: boolean) {
  const rect = anchor.getBoundingClientRect()
  if (matchWidth) el.style.minWidth = `${rect.width}px`
  const { offsetWidth: w, offsetHeight: h } = el
  let top = rect.bottom + GAP
  if (top + h > window.innerHeight - MARGIN && rect.top - GAP - h > MARGIN) top = rect.top - GAP - h
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - w - MARGIN))
  el.style.top = `${Math.max(MARGIN, top)}px`
  el.style.left = `${left}px`
}

export type PopoverHandle = {
  ref: RefObject<HTMLDivElement | null>
  /** React state: follows the popover's `toggle` event, so it can lag one event behind. */
  open: boolean
  /** The popover is open right now (reads the DOM). */
  isOpen: () => boolean
  show: (anchor: HTMLElement) => void
  hide: () => void
  toggle: (anchor: HTMLElement) => void
}

/**
 * `manual` popovers stay open until `hide` (comboboxes). `auto` ones close on a press outside
 * (also in the canvas iframe), on Escape (the focus goes back to the anchor), when the focus
 * moves elsewhere and when the selection changes (the dismiss signal in `../menu/dismiss`).
 * A second click on the anchor closes them.
 */
export function usePopover(mode: 'auto' | 'manual', matchWidth = false): PopoverHandle & { props: PopoverProps } {
  const ref = useRef<HTMLDivElement | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const [open, setOpen] = useState(false)
  // When a press on the anchor closed the popover (the browser closes it on pointerdown, before
  // the click that would open it again).
  const anchorPressedAt = useRef(0)

  const reposition = useCallback(() => {
    if (ref.current && anchor.current) place(ref.current, anchor.current, matchWidth)
  }, [matchWidth])

  useEffect(() => {
    if (!open) return
    reposition()
    // Content renders after `open` flips, so place again once it has a size.
    const frame = requestAnimationFrame(reposition)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  const isOpen = useCallback(() => Boolean(ref.current?.matches(':popover-open')), [])

  const show = useCallback(
    (el: HTMLElement) => {
      const popover = ref.current
      if (!popover || popover.matches(':popover-open')) return
      // The press on this anchor just closed it: the click that follows must not open it again.
      if (el === anchor.current && performance.now() - anchorPressedAt.current < REOPEN_MS) {
        anchorPressedAt.current = 0
        return
      }
      anchor.current = el
      popover.showPopover()
      place(popover, el, matchWidth)
    },
    [matchWidth],
  )

  const hide = useCallback(() => {
    if (ref.current?.matches(':popover-open')) ref.current.hidePopover()
  }, [])

  const toggle = useCallback((el: HTMLElement) => (isOpen() ? hide() : show(el)), [hide, isOpen, show])

  useEffect(() => {
    if (!open || mode !== 'auto') return
    const popover = ref.current
    const inside = (node: EventTarget | null) =>
      node instanceof Node && Boolean(popover?.contains(node) || anchor.current?.contains(node))
    const onPointerDown = (e: PointerEvent) => {
      if (anchor.current?.contains(e.target as Node)) anchorPressedAt.current = performance.now()
    }
    // Focus moved to another control (Tab, a click on a field): close.
    const onFocusIn = (e: FocusEvent) => {
      if (!inside(e.target)) hide()
    }
    // The browser closes the popover on Escape. Focus inside it would fall to the page: give it back to the anchor.
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || !popover?.contains(document.activeElement)) return
      const target = anchor.current
      requestAnimationFrame(() => target?.isConnected && target.focus())
    }
    const offDismiss = onDismissMenus(hide)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      offDismiss()
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open, mode, hide])

  return {
    ref,
    open,
    isOpen,
    show,
    hide,
    toggle,
    props: { ref, mode, onOpenChange: setOpen },
  }
}

type PopoverProps = {
  ref: RefObject<HTMLDivElement | null>
  mode: 'auto' | 'manual'
  onOpenChange: (open: boolean) => void
}

/** Keys that would run editor shortcuts (delete block, deselect) stop here. */
export function stopEditorKeys(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') e.stopPropagation()
}

export function Popover({
  ref,
  mode,
  onOpenChange,
  className,
  children,
  label,
}: PopoverProps & { className?: string; children: ReactNode; label?: string }) {
  return (
    <div
      ref={ref}
      popover={mode}
      aria-label={label}
      className={`builder-styles__popover ${className ?? ''}`}
      // Key events still bubble through the React tree to the panel, which stops editor shortcuts.
      onToggle={(e) => onOpenChange(e.newState === 'open')}
    >
      {children}
    </div>
  )
}

export type Suggestion = { value: string; hint?: string }

const scrollIntoView = (el: HTMLElement | null) => el?.scrollIntoView({ block: 'nearest' })

/** Listbox under a combobox input. Items use `onMouseDown` so the input keeps focus. */
export function SuggestList({
  items,
  active,
  onPick,
  onHover,
}: {
  items: Suggestion[]
  active: number
  onPick: (item: Suggestion) => void
  onHover: (index: number) => void
}) {
  if (items.length === 0) return <p className="builder-styles__suggest-empty">No matches</p>
  return (
    <ul className="builder-styles__suggest" role="listbox">
      {items.map((item, i) => (
        <li
          key={item.value}
          ref={i === active ? scrollIntoView : undefined}
          role="option"
          aria-selected={i === active}
          className="builder-styles__suggest-item"
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(item)
          }}
          onMouseEnter={() => onHover(i)}
        >
          <span>{item.value}</span>
          {item.hint && <span className="builder-styles__suggest-hint">{item.hint}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Prefix matches first, then substring matches. All items when the query is empty. */
export function filterSuggestions(items: Suggestion[], query: string, limit = 200): Suggestion[] {
  const q = query.trim().toLowerCase()
  if (!q) return items.slice(0, limit)
  const starts: Suggestion[] = []
  const contains: Suggestion[] = []
  for (const item of items) {
    const v = item.value.toLowerCase()
    if (v.startsWith(q)) starts.push(item)
    else if (v.includes(q)) contains.push(item)
    if (starts.length >= limit) break
  }
  return [...starts, ...contains].slice(0, limit)
}
