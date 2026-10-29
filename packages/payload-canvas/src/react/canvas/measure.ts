import type { Axis, CanvasMeasurement, Rect, RegionRect, SlotRect } from '../../core'

import { LAYOUT_ROOT_ATTRIBUTE, REGION_ATTRIBUTE } from '../render/regions'

const sameRect = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

/** True when two measurements are equal. Stops at the first difference (scrolling changes `scroll` first). */
export function sameMeasurement(a: CanvasMeasurement | null, b: CanvasMeasurement): boolean {
  if (!a) return false
  if (a.scroll.x !== b.scroll.x || a.scroll.y !== b.scroll.y || a.documentHeight !== b.documentHeight) return false
  if (a.viewport.width !== b.viewport.width || a.viewport.height !== b.viewport.height || a.rootAxis !== b.rootAxis) return false
  if (a.blocks.length !== b.blocks.length || a.slots.length !== b.slots.length) return false
  for (let i = 0; i < a.blocks.length; i++) {
    if (a.blocks[i].id !== b.blocks[i].id || !sameRect(a.blocks[i].rect, b.blocks[i].rect)) return false
  }
  for (let i = 0; i < a.slots.length; i++) {
    const x = a.slots[i]
    const y = b.slots[i]
    if (x.ownerId !== y.ownerId || x.slot !== y.slot || x.axis !== y.axis || x.empty !== y.empty || !sameRect(x.rect, y.rect)) return false
  }
  if (Boolean(a.root) !== Boolean(b.root) || (a.root && b.root && !sameRect(a.root, b.root))) return false
  const ra = a.regions ?? []
  const rb = b.regions ?? []
  if (ra.length !== rb.length) return false
  for (let i = 0; i < ra.length; i++) {
    if (ra[i].name !== rb[i].name || !sameRect(ra[i].rect, rb[i].rect)) return false
  }
  return true
}

function toRect(r: DOMRect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/** The smallest rect around all the rects that have a size. Null when none has. */
export function unionRect(rects: readonly Rect[]): Rect | null {
  const sized = rects.filter((r) => r.width > 0 || r.height > 0)
  if (sized.length === 0) return null
  const left = Math.min(...sized.map((r) => r.x))
  const top = Math.min(...sized.map((r) => r.y))
  const right = Math.max(...sized.map((r) => r.x + r.width))
  const bottom = Math.max(...sized.map((r) => r.y + r.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The element's box. An element with `display: contents` (a repeat without a wrapper, or a block
 * with the `contents` class) has no box of its own: it gets the box around its children.
 */
function boxOf(el: Element): Rect {
  const own = toRect(el.getBoundingClientRect())
  if (own.width > 0 || own.height > 0 || getComputedStyle(el).display !== 'contents') return own
  return unionRect(Array.from(el.children, boxOf)) ?? own
}

/** The area children may show in, by its edges. A missing edge does not clip. */
export type ClipArea = { left: number; top: number; right: number; bottom: number }

const NO_CLIP: ClipArea = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity }

/** The part of `rect` inside `area`. Outside it: an empty rect on the area's nearest edge. */
export function clipRect(rect: Rect, area: ClipArea | null): Rect {
  if (!area) return rect
  const left = Math.min(Math.max(rect.x, area.left), area.right)
  const top = Math.min(Math.max(rect.y, area.top), area.bottom)
  const right = Math.max(Math.min(rect.x + rect.width, area.right), left)
  const bottom = Math.max(Math.min(rect.y + rect.height, area.bottom), top)
  if (left === rect.x && top === rect.y && right === rect.x + rect.width && bottom === rect.y + rect.height) return rect
  return { x: left, y: top, width: right - left, height: bottom - top }
}

const intersect = (a: ClipArea, b: ClipArea): ClipArea => ({
  left: Math.max(a.left, b.left),
  top: Math.max(a.top, b.top),
  right: Math.min(a.right, b.right),
  bottom: Math.min(a.bottom, b.bottom),
})

/** A fixed element and an open modal or popover (the top layer) escape the clipping of their ancestors. */
function escapesClip(el: Element, style: CSSStyleDeclaration): boolean {
  if (style.position === 'fixed') return true
  try {
    return el.matches(':modal, :popover-open')
  } catch {
    return false
  }
}

/**
 * The area each element's children show in: its ancestors' boxes that clip their overflow
 * (`overflow` other than `visible`), up to `root`. A carousel's viewport hides the slides outside
 * it, so their rects shrink to the visible part (empty when hidden), and the pointer never finds
 * a hidden slide. Cached per measurement.
 */
function createClipper(root: HTMLElement) {
  const areas = new Map<Element, ClipArea | null>()
  const areaInside = (el: Element | null): ClipArea | null => {
    if (!el || el === root || !root.contains(el)) return null
    const cached = areas.get(el)
    if (cached !== undefined) return cached
    const style = getComputedStyle(el)
    const outer = escapesClip(el, style) ? null : areaInside(el.parentElement)
    let area = outer
    if (style.display !== 'contents' && (style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
      const box = el.getBoundingClientRect()
      const own: ClipArea = {
        ...NO_CLIP,
        ...(style.overflowX !== 'visible' ? { left: box.left, right: box.right } : {}),
        ...(style.overflowY !== 'visible' ? { top: box.top, bottom: box.bottom } : {}),
      }
      area = outer ? intersect(own, outer) : own
    }
    areas.set(el, area)
    return area
  }
  /** The element's box, clipped by the ancestors that clip it. */
  return (el: Element): Rect => {
    const box = boxOf(el)
    return escapesClip(el, getComputedStyle(el)) ? box : clipRect(box, areaInside(el.parentElement))
  }
}

/** The direction children flow in: from flex direction or the number of grid columns. */
export function axisOf(el: Element): Axis {
  const style = getComputedStyle(el)
  // No box of its own: its children flow in the parent.
  if (style.display === 'contents' && el.parentElement) return axisOf(el.parentElement)
  if (style.display.includes('flex')) return style.flexDirection.startsWith('row') ? 'x' : 'y'
  if (style.display.includes('grid')) {
    return style.gridTemplateColumns.split(' ').filter(Boolean).length > 1 ? 'x' : 'y'
  }
  return 'y'
}

/**
 * Measures every block and slot under `root`, in iframe viewport coordinates.
 * An empty slot has two marked elements: the container and the placeholder inside it.
 * The placeholder wins, so the drop target sees `empty: true`.
 */
export function measure(root: HTMLElement): CanvasMeasurement {
  const visibleBox = createClipper(root)
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'), (el) => ({
    id: el.dataset.blockId ?? '',
    rect: visibleBox(el),
  }))

  const slots = new Map<string, SlotRect>()
  for (const el of root.querySelectorAll<HTMLElement>('[data-slot-owner]')) {
    const ownerId = el.dataset.slotOwner ?? ''
    const slot = el.dataset.slot ?? 'children'
    const key = `${ownerId}\u0000${slot}`
    const empty = el.dataset.slotEmpty !== undefined
    if (slots.get(key)?.empty && !empty) continue
    // An empty placeholder takes the container's axis, so the drop indicator matches the layout.
    const axis = empty && el.parentElement ? axisOf(el.parentElement) : axisOf(el)
    slots.set(key, { ownerId, slot, rect: visibleBox(el), axis, empty })
  }

  // In a page frame the layout fills its outlet, not the whole canvas: the root list's axis and
  // box come from the outlet, so fixed regions never count as part of the layout.
  const outlet = root.querySelector<HTMLElement>(`[${LAYOUT_ROOT_ATTRIBUTE}]`)
  const regions: RegionRect[] = []
  if (outlet) {
    for (const el of root.querySelectorAll<HTMLElement>(`[${REGION_ATTRIBUTE}]`)) {
      const rect = el.getBoundingClientRect()
      // Hidden copies (a mobile and a desktop version of one header) are left out.
      if (rect.width === 0 && rect.height === 0) continue
      regions.push({ name: el.getAttribute(REGION_ATTRIBUTE) ?? '', rect: toRect(rect) })
    }
  }

  return {
    blocks,
    slots: [...slots.values()],
    rootAxis: axisOf(outlet ?? root),
    ...(outlet ? { root: toRect(outlet.getBoundingClientRect()), regions } : {}),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    documentHeight: document.documentElement.scrollHeight,
  }
}
