// Interactive blocks in the canvas: controls that work as on the site, disclosures that open and
// close, and the reveal step that brings a selected block out of a closed item or another slide.

import { CANVAS_CONTROL_ATTRIBUTE, revealBlock } from '../render/reveal'

const CONTROL_SELECTOR = `[${CANVAS_CONTROL_ATTRIBUTE}]`

/** The canvas control (an element with `data-builder-control`) at or around `target`, or null. */
export function controlAt(target: EventTarget | null): Element | null {
  return target instanceof Element ? target.closest(CONTROL_SELECTOR) : null
}

/** The `<details>` whose `<summary>` holds `target`, or null. */
export function summaryOwner(target: EventTarget | null): HTMLDetailsElement | null {
  const summary = target instanceof Element ? target.closest('summary') : null
  const details = summary?.parentElement
  return details instanceof HTMLDetailsElement && summary === details.querySelector(':scope > summary') ? details : null
}

/**
 * The closed `<details>` to open for `el`, outermost first: `el` itself when it is one (a selected
 * disclosure shows its content), and those whose content (not their summary) holds it. The
 * summary of a closed item is visible, so it opens nothing.
 */
export function closedDetailsAround(el: Element): HTMLDetailsElement[] {
  const closed: HTMLDetailsElement[] = []
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (!(node instanceof HTMLDetailsElement) || node.open) continue
    if (summaryOwner(el) === node) continue
    closed.unshift(node)
  }
  return closed
}

/**
 * Makes a selected block visible: opens the closed `<details>` around it, then sends the reveal
 * event, so interactive blocks around it (a carousel, tabs, a popup) can show it. `keepClosed`
 * leaves an item closed (one the user just closed with a click on its summary).
 */
export function revealInCanvas(el: Element, keepClosed?: (details: HTMLDetailsElement) => boolean): void {
  // Outermost first: an inner item opens inside an open outer one.
  for (const details of closedDetailsAround(el)) if (!keepClosed?.(details)) details.open = true
  revealBlock(el)
}

/**
 * The block's element that shows on screen: a block can render more than once (a mobile and a
 * desktop copy), and only one of them has a box. Without a box (inside a closed item): the first.
 */
export function blockElement(id: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>(`[data-block-id="${CSS.escape(id)}"]`)
  for (const el of all) if (el.getClientRects().length > 0) return el
  return all[0] ?? null
}
