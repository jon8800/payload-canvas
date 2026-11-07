'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { joinClasses, labelOf, textOr } from '../../../blocks/client/helpers'
import { POPUP_CLASS_MAP as C, POPUP_LABELS } from '../../../blocks/client/popup'
import { CANVAS_CONTROL_ATTRIBUTE, REVEAL_EVENT, useCanvasReveal } from '../../render/reveal'
import type { BlockComponentProps } from '../../render/types'
import { CloseIcon } from './glyphs'

export type PopupLabels = Partial<typeof POPUP_LABELS>

/** On the canvas the trigger and the close button work as on the site: a click does not select the block. */
const CONTROL = { [CANVAS_CONTROL_ATTRIBUTE]: '' }

/**
 * On the canvas the open popup is a popover, not a modal: it shows over the page as on the site,
 * but the editor can still select and edit its blocks. These are the browser's styles for a modal
 * dialog, which a popover lacks: centred in the canvas, never taller than it.
 */
const CANVAS_PANEL: CSSProperties = { position: 'fixed', inset: 0, maxHeight: 'calc(100% - 2rem)', overflow: 'auto' }

/** The href of links that open the popup ("#newsletter"), or null when the anchor is empty or not a plain name. */
export function anchorHref(value: unknown): string | null {
  const name = textOr(value, '').replace(/^#/, '')
  return /^[\w-]+$/.test(name) ? `#${name}` : null
}

/** True when the point lies outside the box: a click on the backdrop of a modal dialog. */
export function isOutside(box: { left: number; top: number; right: number; bottom: number }, x: number, y: number): boolean {
  return x < box.left || x > box.right || y < box.top || y > box.bottom
}

/**
 * A button (the "trigger" slot) that opens the "content" slot in a native modal <dialog>. The
 * dialog keeps the focus inside, makes the page inert and closes on Escape; a click on the
 * backdrop and the close button close it too, and the page does not scroll while it is open.
 * Links to `#<anchor>` open it as well. The content stays in the HTML.
 *
 * On the canvas the dialog is a popover over the page, with the same backdrop, but not modal: the
 * editor can select and edit the blocks in it. It opens when the trigger is clicked or the editor
 * selects the popup or a block inside it (the reveal event). It closes on Escape, the close button,
 * a click on the backdrop, and when the editor selects a block outside it.
 */
export function Popup({ block, props, className, attributes, partAttributes, slots, mode, labels }: BlockComponentProps & { labels?: PopupLabels }) {
  const root = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const canvas = mode === 'canvas'
  const dialogId = `${useId()}popup`
  const label = textOr(props.label, '')
  const href = anchorHref(props.anchor)
  const L = labels ? { ...POPUP_LABELS, ...labels } : POPUP_LABELS

  // Site: open as a modal, and keep the page from scrolling until it closes.
  useEffect(() => {
    const el = dialog.current
    if (!el || canvas) return
    if (!open) {
      if (el.open) el.close()
      return
    }
    if (!el.open) el.showModal()
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = overflow
    }
  }, [canvas, open])

  // Without its own name, the dialog is named by its first heading. After every render: the
  // content can change (an edit on the canvas, a list that loads).
  useEffect(() => {
    const el = dialog.current
    if (!el || label) return
    const heading = el.querySelector('h1, h2, h3, h4, h5, h6')
    if (!heading) return el.removeAttribute('aria-labelledby')
    if (!heading.id) heading.id = `${dialogId}-title`
    el.setAttribute('aria-labelledby', heading.id)
  })

  // Links to "#<anchor>" open the popup, and so does that hash in the address when the page loads.
  useEffect(() => {
    if (!href || canvas) return
    const onClick = (event: globalThis.MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a') : null
      if (link?.getAttribute('href') !== href) return
      event.preventDefault()
      setOpen(true)
    }
    document.addEventListener('click', onClick)
    // The address is outside React: read it once the page has hydrated.
    // oxlint-disable-next-line react/set-state-in-effect
    if (window.location.hash === href) setOpen(true)
    return () => document.removeEventListener('click', onClick)
  }, [canvas, href])

  // Canvas: the open popup is a popover (the browser's top layer, so no parent clips it). Before
  // paint, so the backdrop never shows without the box.
  useLayoutEffect(() => {
    const el = dialog.current
    if (!el || !canvas || typeof el.showPopover !== 'function') return
    const shown = el.matches(':popover-open')
    if (open && !shown) el.showPopover()
    if (!open && shown) el.hidePopover()
  }, [canvas, open])

  // Canvas: Escape and selecting a block outside the popup close it.
  useEffect(() => {
    if (!canvas || !open) return
    const onKey = (event: KeyboardEvent) => {
      // Escape in a text being edited ends the editing, not the popup. (The canvas also sends
      // Escape to the editor, which clears the selection.)
      const editing = event.target instanceof HTMLElement && event.target.isContentEditable
      if (event.key === 'Escape' && !editing) setOpen(false)
    }
    const onReveal = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener(REVEAL_EVENT, onReveal)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener(REVEAL_EVENT, onReveal)
    }
  }, [canvas, open])

  // Canvas: selecting the popup or a block in its content opens it.
  useCanvasReveal(root, (target) => {
    if (target === root.current || dialog.current?.contains(target)) setOpen(true)
  })

  // A click on the backdrop reaches the dialog itself (on the canvas too: it is a canvas control there).
  const onDialogClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target !== event.currentTarget) return
    if (isOutside(event.currentTarget.getBoundingClientRect(), event.clientX, event.clientY)) setOpen(false)
  }

  // On the site an empty trigger renders no button: links to the anchor open the popup.
  const trigger = canvas || (block.slots?.trigger?.length ?? 0) > 0
  return (
    <div {...attributes} ref={root} className={className}>
      {trigger ? (
        <button
          {...partAttributes.trigger}
          {...CONTROL}
          type="button"
          className={joinClasses(C.trigger, partAttributes.trigger?.className)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={dialogId}
          onClick={() => setOpen(true)}
        >
          {slots.trigger}
        </button>
      ) : null}
      {/* A click on the backdrop reaches the dialog itself; Escape works without this handler. */}
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <dialog
        ref={dialog}
        id={dialogId}
        data-popup-panel=""
        aria-label={label || undefined}
        className={joinClasses(C.panel, partAttributes.panel?.className)}
        open={canvas ? open : undefined}
        popover={canvas ? 'manual' : undefined}
        style={canvas ? CANVAS_PANEL : undefined}
        onClose={() => setOpen(false)}
        onClick={onDialogClick}
      >
        <button
          {...CONTROL}
          type="button"
          data-popup-close=""
          className={joinClasses(C.close, partAttributes.close?.className)}
          aria-label={labelOf(props, L, 'closeLabel')}
          onClick={() => setOpen(false)}
        >
          <CloseIcon className={C.icon} />
        </button>
        <div {...partAttributes.content}>{slots.content}</div>
      </dialog>
    </div>
  )
}
