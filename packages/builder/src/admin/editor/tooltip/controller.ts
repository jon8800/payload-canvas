'use client'

// The tooltip controller behind `data-tooltip` (see `Tooltips.tsx` for the standard). One set of
// listeners on the admin document and one tooltip element in the browser's top layer.

import { placeTooltip, type TooltipSide } from './place'

/** Hover time before a tooltip shows. */
const HOVER_DELAY_MS = 450
/** Keyboard focus shows a tooltip a little faster. */
const FOCUS_DELAY_MS = 250
/** A tooltip that hid this recently: the next one shows at once (moving along a toolbar). */
const WARM_MS = 400
/** While shown: how often to check that the element is still on the page. */
const CHECK_MS = 250

export const TOOLTIP_ID = 'builder-tooltip'
const SIDES = new Set<string>(['top', 'bottom', 'left', 'right'])

let installs = 0
let uninstall: (() => void) | null = null

/** Installs the controller on the document (once, however many editors mount it). Returns the cleanup. */
export function installTooltips(doc: Document = document): () => void {
  installs++
  if (installs === 1) uninstall = install(doc)
  return () => {
    installs--
    if (installs > 0) return
    uninstall?.()
    uninstall = null
  }
}

const tooltipOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null

const textOf = (el: HTMLElement) => el.dataset.tooltip?.trim() ?? ''

function install(doc: Document): () => void {
  const view = doc.defaultView ?? window
  const tip = doc.createElement('div')
  tip.id = TOOLTIP_ID
  tip.className = 'builder-tooltip'
  tip.setAttribute('role', 'tooltip')
  tip.popover = 'manual'
  doc.body.append(tip)

  /** The element whose tooltip is shown or about to show. */
  let target: HTMLElement | null = null
  let shown = false
  let byFocus = false
  let hiddenAt = 0
  let timer = 0
  let check = 0
  /** Set when the tooltip added `aria-describedby` to the target. */
  let described: HTMLElement | null = null

  // A new text ("Copy" to "Copied") shows at once, also after a press hid the tooltip. An open
  // menu hides it.
  const observer = new MutationObserver((records) => {
    if (!target) return
    if (target.getAttribute('aria-expanded') === 'true') hide()
    else if (records.some((r) => r.attributeName === 'data-tooltip')) show()
  })

  const position = (el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const side = (SIDES.has(el.dataset.tooltipSide ?? '') ? el.dataset.tooltipSide : 'bottom') as TooltipSide
    const place = placeTooltip(
      rect,
      { width: tip.offsetWidth, height: tip.offsetHeight },
      { width: view.innerWidth, height: view.innerHeight },
      side,
    )
    tip.style.left = `${Math.round(place.left)}px`
    tip.style.top = `${Math.round(place.top)}px`
    tip.dataset.side = place.side
  }

  const show = () => {
    view.clearTimeout(timer)
    timer = 0
    const el = target
    const text = el ? textOf(el) : ''
    if (!el || !el.isConnected || !text || el.getAttribute('aria-expanded') === 'true') {
      hide()
      return
    }
    tip.textContent = text
    if (!tip.matches(':popover-open')) tip.showPopover()
    position(el)
    if (!shown) {
      shown = true
      check = view.setInterval(() => {
        if (!target?.isConnected) hide()
      }, CHECK_MS)
    }
    // Screen readers read the tooltip too, unless it only repeats the element's name.
    if (!el.hasAttribute('aria-describedby') && el.getAttribute('aria-label') !== text) {
      el.setAttribute('aria-describedby', TOOLTIP_ID)
      described = el
    }
  }

  /** Hides the tooltip. The target stays: the same element shows it again only after the pointer leaves it. */
  const hide = () => {
    view.clearTimeout(timer)
    timer = 0
    if (shown) {
      hiddenAt = view.performance.now()
      shown = false
      view.clearInterval(check)
    }
    if (tip.matches(':popover-open')) tip.hidePopover()
    if (described) {
      described.removeAttribute('aria-describedby')
      described = null
    }
  }

  const setTarget = (el: HTMLElement | null, delay: number) => {
    if (el === target) return
    const warm = shown || view.performance.now() - hiddenAt < WARM_MS
    hide()
    observer.disconnect()
    target = el
    if (!el) return
    observer.observe(el, { attributes: true, attributeFilter: ['data-tooltip', 'aria-expanded'] })
    if (warm) show()
    else timer = view.setTimeout(show, delay)
  }

  const onPointerOver = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    // A button is held: a drag (or a text selection) is running. A tooltip then only gets in the
    // way, and inserting it restyles the whole admin while Payload's drag overlay is mounted.
    if (e.buttons !== 0) {
      setTarget(null, 0)
      return
    }
    const el = tooltipOf(e.target)
    if (!el && byFocus) return
    byFocus = false
    setTarget(el, HOVER_DELAY_MS)
  }
  const onPointerOut = (e: PointerEvent) => {
    // The pointer left the window.
    if (!e.relatedTarget && !byFocus) setTarget(null, 0)
  }
  const onFocusIn = (e: FocusEvent) => {
    const el = tooltipOf(e.target)
    // Keyboard focus only: a click focuses too, and the pointer already decides then.
    if (!el || !(e.target instanceof Element) || !e.target.matches(':focus-visible')) return
    byFocus = true
    setTarget(el, FOCUS_DELAY_MS)
  }
  const onFocusOut = () => {
    if (!byFocus) return
    byFocus = false
    setTarget(null, 0)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hide()
  }

  doc.addEventListener('pointerover', onPointerOver, true)
  doc.addEventListener('pointerout', onPointerOut, true)
  doc.addEventListener('pointerdown', hide, true)
  doc.addEventListener('focusin', onFocusIn, true)
  doc.addEventListener('focusout', onFocusOut, true)
  doc.addEventListener('keydown', onKeyDown, true)
  doc.addEventListener('scroll', hide, true)
  view.addEventListener('resize', hide)
  view.addEventListener('blur', hide)

  return () => {
    hide()
    observer.disconnect()
    doc.removeEventListener('pointerover', onPointerOver, true)
    doc.removeEventListener('pointerout', onPointerOut, true)
    doc.removeEventListener('pointerdown', hide, true)
    doc.removeEventListener('focusin', onFocusIn, true)
    doc.removeEventListener('focusout', onFocusOut, true)
    doc.removeEventListener('keydown', onKeyDown, true)
    doc.removeEventListener('scroll', hide, true)
    view.removeEventListener('resize', hide)
    view.removeEventListener('blur', hide)
    tip.remove()
  }
}
