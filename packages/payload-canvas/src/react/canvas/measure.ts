import type { Axis, CanvasMeasurement, Rect, SlotRect } from '../../core'

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
  return true
}

function toRect(r: DOMRect): Rect {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/** The direction children flow in: from flex direction or the number of grid columns. */
export function axisOf(el: Element): Axis {
  const style = getComputedStyle(el)
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
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'), (el) => ({
    id: el.dataset.blockId ?? '',
    rect: toRect(el.getBoundingClientRect()),
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
    slots.set(key, { ownerId, slot, rect: toRect(el.getBoundingClientRect()), axis, empty })
  }

  return {
    blocks,
    slots: [...slots.values()],
    rootAxis: axisOf(root),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scroll: { x: window.scrollX, y: window.scrollY },
    documentHeight: document.documentElement.scrollHeight,
  }
}
