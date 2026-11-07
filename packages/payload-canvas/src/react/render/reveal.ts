'use client'

// Interactive blocks (a carousel, an accordion, a popup, tabs) keep part of their content out of
// view. In the editor's canvas, a block inside them must come into view when the editor selects it
// (in the canvas or in Layers). The canvas sends a "reveal" DOM event from the selected block's
// element; it bubbles, so every interactive block around it can show it: scroll to the slide, open
// the item, open the popup, pick the tab.

import { useEffect, useEffectEvent, type RefObject } from 'react'

/** The DOM event the canvas sends from a selected block's element. It bubbles. */
export const REVEAL_EVENT = 'builder:reveal'

/**
 * Put this attribute on the controls of an interactive block (arrows, dots, tab buttons, a popup's
 * close button). In the canvas, a click on such an element works as on the site (it does not select
 * the block), and the "+" insert button does not show over it.
 */
export const CANVAS_CONTROL_ATTRIBUTE = 'data-builder-control'

/** Sends the reveal event from a block's element. The canvas calls it when a block is selected. */
export function revealBlock(element: Element): void {
  element.dispatchEvent(new CustomEvent(REVEAL_EVENT, { bubbles: true }))
}

/**
 * Calls `onReveal` with the selected block's element when the editor selects a block inside the
 * element of `ref`. Only the canvas sends the event, so on the site it never fires. For client
 * components. Example: scroll a carousel to the slide that holds the target.
 */
export function useCanvasReveal(ref: RefObject<HTMLElement | null>, onReveal: (target: HTMLElement) => void): void {
  // The latest `onReveal`, without adding the listener again on every render.
  const reveal = useEffectEvent(onReveal)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const listener = (event: Event) => {
      if (event.target instanceof HTMLElement) reveal(event.target)
    }
    element.addEventListener(REVEAL_EVENT, listener)
    return () => element.removeEventListener(REVEAL_EVENT, listener)
  }, [ref])
}
