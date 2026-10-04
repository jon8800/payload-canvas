// DOM helpers for inline editing: keep and restore what React rendered, place the caret,
// find the element that shows a text prop, and a small throttle.

import type { Block, BlockDefinition } from '@payload-toolkit/builder/core'
import { EDITABLE_TEXT_ATTRIBUTE } from '../../render/editable'
import { inlineKind, readText } from './model'

/**
 * The element's attributes and its whole subtree as React left it: every element's child list and
 * every text node's text. Editing changes the DOM in place; `restoreDom` puts it back exactly, so
 * React's next render finds the nodes it expects.
 */
export type DomSnapshot = {
  attributes: Array<[string, string]>
  children: Array<[Element, Node[]]>
  texts: Array<[Text, string]>
}

export function snapshotDom(el: HTMLElement): DomSnapshot {
  const children: Array<[Element, Node[]]> = []
  const texts: Array<[Text, string]> = []
  const walk = (node: Element) => {
    children.push([node, Array.from(node.childNodes)])
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) texts.push([child as Text, (child as Text).data])
      else if (child.nodeType === Node.ELEMENT_NODE) walk(child as Element)
    }
  }
  walk(el)
  return { attributes: Array.from(el.attributes, (a) => [a.name, a.value]), children, texts }
}

export function restoreDom(el: HTMLElement, snapshot: DomSnapshot) {
  for (const [node, list] of snapshot.children) node.replaceChildren(...list)
  for (const [node, data] of snapshot.texts) if (node.data !== data) node.data = data
  const keep = new Map(snapshot.attributes)
  for (const name of el.getAttributeNames()) if (!keep.has(name)) el.removeAttribute(name)
  for (const [name, value] of keep) if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/** A collapsed range `offset` characters into the text of `el` (text nodes only), or null past the end. */
function rangeAtOffset(el: HTMLElement, offset: number): Range | null {
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let left = Math.max(0, offset)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    if (left <= node.data.length) {
      const range = doc.createRange()
      range.setStart(node, left)
      return range
    }
    left -= node.data.length
  }
  return null
}

/**
 * Puts the caret `offset` characters into the text of `el`, else at a viewport point inside `el`,
 * else at the end of `el`.
 */
export function placeCaret(el: HTMLElement, point: { x: number; y: number } | null, offset?: number) {
  const doc = el.ownerDocument
  const selection = doc.getSelection()
  if (!selection) return
  let range: Range | null = offset === undefined ? null : rangeAtOffset(el, offset)
  if (!range && point) {
    const position = doc.caretPositionFromPoint?.(point.x, point.y)
    if (position) {
      range = doc.createRange()
      range.setStart(position.offsetNode, position.offset)
    } else {
      range = doc.caretRangeFromPoint?.(point.x, point.y) ?? null
    }
    if (range && !el.contains(range.startContainer)) range = null
  }
  if (range) range.collapse(true)
  else {
    range = doc.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

export type Throttle = {
  /** Runs `fn` once `ms` after the first call since the last run. */
  schedule: () => void
  /** Runs a scheduled call now. */
  flush: () => void
  cancel: () => void
}

export function createThrottle(fn: () => void, ms: number): Throttle {
  let timer: number | null = null
  const cancel = () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
  }
  return {
    schedule() {
      if (timer !== null) return
      timer = window.setTimeout(() => {
        timer = null
        fn()
      }, ms)
    },
    flush() {
      if (timer === null) return
      cancel()
      fn()
    },
    cancel,
  }
}

/** An element that shows a text prop of a block. */
export type EditableTarget = { element: HTMLElement; blockId: string; path: string }

/** The block element `el` belongs to (its own `data-block-id` or the nearest one above it). */
function ownerBlock(el: Element): HTMLElement | null {
  return el.closest<HTMLElement>('[data-block-id]')
}

/** True when `el` holds only text and line breaks. */
function textOnly(el: Element): boolean {
  for (const child of el.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && child.nodeName !== 'BR') return false
  }
  return true
}

/** String props a block shows as plain text (text and textarea fields at the top level). */
function stringProps(block: Block, definition: BlockDefinition | undefined): Array<[string, string]> {
  return Object.entries(block.props ?? {}).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === 'string' && entry[1].trim() !== '' && inlineKind(definition, entry[0], entry[1]) !== null,
  )
}

/**
 * Finds the text prop under `target` (a double-click). Elements marked with `data-builder-text`
 * win. For blocks without marks (custom components), an element whose whole text equals a
 * text prop's value counts as that prop.
 */
export function editableAt(
  target: Element,
  block: (id: string) => Block | null,
  definition: (type: string) => BlockDefinition | undefined,
): EditableTarget | null {
  const blockEl = ownerBlock(target)
  const blockId = blockEl?.dataset.blockId
  if (!blockEl || !blockId) return null
  const marked = target.closest<HTMLElement>(`[${EDITABLE_TEXT_ATTRIBUTE}]`)
  if (marked && ownerBlock(marked) === blockEl) {
    return { element: marked, blockId, path: marked.getAttribute(EDITABLE_TEXT_ATTRIBUTE) ?? '' }
  }
  const data = block(blockId)
  if (!data) return null
  const props = stringProps(data, definition(data.type))
  if (props.length === 0) return null
  for (let el: Element | null = target; el && blockEl.contains(el); el = el.parentElement) {
    if (!(el instanceof HTMLElement) || !textOnly(el)) continue
    const text = readText(el, true).trim()
    const match = props.find(([, value]) => value.trim() === text)
    if (match) return { element: el, blockId, path: match[0] }
    if (el === blockEl) break
  }
  return null
}

/** The first text prop element of a block (Enter on a selected block), or null. */
export function firstEditable(
  blockEl: HTMLElement,
  block: (id: string) => Block | null,
  definition: (type: string) => BlockDefinition | undefined,
): EditableTarget | null {
  const blockId = blockEl.dataset.blockId
  if (!blockId) return null
  const own = (el: Element) => ownerBlock(el) === blockEl
  const candidates = [blockEl, ...blockEl.querySelectorAll<HTMLElement>(`[${EDITABLE_TEXT_ATTRIBUTE}]`)]
  const marked = candidates.find((el) => el.hasAttribute(EDITABLE_TEXT_ATTRIBUTE) && own(el) && el.getClientRects().length > 0)
  if (marked) return { element: marked, blockId, path: marked.getAttribute(EDITABLE_TEXT_ATTRIBUTE) ?? '' }
  // Unmarked custom blocks: the first own element whose text equals a text prop.
  const elements = [blockEl, ...blockEl.querySelectorAll<HTMLElement>('*')].filter((el) => own(el) && textOnly(el))
  for (const el of elements) {
    const found = editableAt(el, block, definition)
    if (found) return found
  }
  return null
}
