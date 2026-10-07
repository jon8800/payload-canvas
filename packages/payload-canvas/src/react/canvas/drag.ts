// Smooth drag mode inside the canvas iframe. The admin decides everything (drop target, offsets);
// this module only moves elements on screen:
//
// - the dragged block is hidden and a lifted copy of it follows the pointer (a block too big to
//   read shrunk lifts no copy: the admin's compact card follows the pointer instead);
// - blocks slide out of the way with CSS transitions on `transform` (the compositor runs them);
// - on drop, once the new layout has rendered, every block that moved animates from where it was
//   on screen to its new place (FLIP), the dropped block from the lifted copy;
// - on cancel, blocks slide back and the copy flies back to the hidden block.
//
// It never changes the layout and never moves an element in the DOM. Inline `transform` and
// `transition` values it replaces are put back afterwards.

import type { Point, Rect } from '../../core'
import {
  flipFrom,
  flipTransform,
  intersects,
  isStill,
  MAKE_ROOM,
  SETTLE,
  springAt,
  springEasing,
  type CanvasDragStart,
  type Flip,
} from '../../protocol'

const ROOM_TRANSITION = `transform ${MAKE_ROOM.duration}ms ${springEasing(MAKE_ROOM)}`
const SETTLE_EASING = springEasing(SETTLE)
/** How long the canvas waits for the layout with the drop result before it gives up and slides back. */
const DROP_WAIT_MS = 1500
/** Blocks this far outside the viewport move at once: an animation there costs work and shows nothing. */
const ANIMATE_MARGIN = 200
/** The lifted copy grows a little, like a card picked up. */
const LIFT = 1.02
/** Most tilt of the lifted copy, in degrees, when the pointer moves fast sideways. */
const MAX_TILT = 3
const SHADOW_LIFTED = '0 18px 40px -8px rgb(0 0 0 / 0.35), 0 4px 12px rgb(0 0 0 / 0.12)'
const SHADOW_RESTING = '0 1px 2px rgb(0 0 0 / 0.08)'

export type CanvasDrag = {
  start(drag: CanvasDragStart): void
  preview(offsets: Record<string, Point>): void
  pointer(x: number, y: number, inside: boolean): void
  end(drop: boolean, ids: string[], placeholder: Rect | null, from?: Rect): void
  /** Call after each commit with the layout the canvas rendered. Runs the drop animation once the drop result is on screen. */
  rendered(layout: unknown): void
  dispose(): void
}

type Saved = { transform: string; transition: string }

type Ghost = {
  box: HTMLElement
  width: number
  height: number
  anchor: Point
  fit: number
  /** The hidden block's rect when the drag started: the copy lifts from here and flies back here. */
  home: Rect
  /** When the copy started to lift (ms), or null when it appeared under the pointer. */
  liftAt: number | null
  tilt: number
  last: { x: number; y: number; t: number } | null
}

type PendingDrop = { first: Map<string, Rect>; from: Rect | null; ids: string[]; placeholder: Rect | null; layout: unknown; timer: number }

type Options = {
  root: () => HTMLElement | null
  /** The layout the canvas shows now. */
  layout: () => unknown
  /** Animations finished: block rects are final again (re-measure). */
  onSettled: () => void
}

const toRect = (r: DOMRect): Rect => ({ x: r.x, y: r.y, width: r.width, height: r.height })

/** Every block element by id, in document order. Repeated collection items share ids: the first wins. */
function blockElements(root: HTMLElement | null): Map<string, HTMLElement> {
  const out = new Map<string, HTMLElement>()
  if (!root) return out
  for (const el of root.querySelectorAll<HTMLElement>('[data-block-id]')) {
    const id = el.dataset.blockId
    if (id && !out.has(id)) out.set(id, el)
  }
  return out
}

/** The first non-transparent background at or above `el`, else white. */
function backgroundOf(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const color = getComputedStyle(node).backgroundColor
    if (color && color !== 'transparent' && !/rgba?\(.*,\s*0\)$/.test(color) && !color.endsWith('/ 0)')) return color
  }
  return '#fff'
}

/** A copy of the block for the lifted ghost: no ids the editor looks up, no frames or videos to reload. */
function copyOf(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement
  for (const el of [clone, ...clone.querySelectorAll<HTMLElement>('*')]) {
    el.removeAttribute('data-block-id')
    el.removeAttribute('data-builder-editing')
    el.removeAttribute('contenteditable')
    el.removeAttribute('id')
  }
  for (const media of clone.querySelectorAll<HTMLElement>('iframe, video, audio')) {
    const stand = document.createElement('div')
    stand.style.cssText = `width:${media.offsetWidth || 160}px;max-width:100%;aspect-ratio:16/9;background:rgb(0 0 0 / 0.08)`
    media.replaceWith(stand)
  }
  return clone
}

export function createCanvasDrag({ root, layout, onSettled }: Options): CanvasDrag {
  let elements = new Map<string, HTMLElement>()
  /** Block rects when the drag started, and the scroll then. */
  let startRects = new Map<HTMLElement, Rect>()
  let startScroll = { x: 0, y: 0 }
  const saved = new Map<HTMLElement, Saved>()
  const applied = new Map<HTMLElement, string>()
  let source: HTMLElement | null = null
  let ghost: Ghost | null = null
  let pointer: { x: number; y: number; inside: boolean } | null = null
  let frame = 0
  let pending: PendingDrop | null = null
  let settleTimer = 0
  let active = false

  const save = (el: HTMLElement) => {
    if (!saved.has(el)) saved.set(el, { transform: el.style.transform, transition: el.style.transition })
    return saved.get(el) as Saved
  }

  /** True when the element is near the viewport (now, or after moving by `d`). */
  const nearView = (el: HTMLElement, d: Point | null) => {
    const rect = startRects.get(el)
    if (!rect) return true
    const view = { x: -ANIMATE_MARGIN, y: -ANIMATE_MARGIN, width: window.innerWidth + 2 * ANIMATE_MARGIN, height: window.innerHeight + 2 * ANIMATE_MARGIN }
    const now = { ...rect, x: rect.x - (window.scrollX - startScroll.x), y: rect.y - (window.scrollY - startScroll.y) }
    return intersects(now, view) || (d !== null && intersects({ ...now, x: now.x + d.x, y: now.y + d.y }, view))
  }

  /** Slides an element to `offset` (a translate), or back to its own transform with ''. */
  const slide = (el: HTMLElement, offset: string, d: Point | null = null) => {
    if ((applied.get(el) ?? '') === offset) return
    const own = save(el)
    const transition = nearView(el, d) ? ROOM_TRANSITION : 'none'
    if (el.style.transition !== transition) el.style.transition = transition
    el.style.transform = offset ? `${offset} ${own.transform}`.trim() : own.transform
    if (offset) applied.set(el, offset)
    else applied.delete(el)
  }

  /** Puts back every inline transform and transition at once (no animation). */
  const restoreAll = () => {
    for (const [el, own] of saved) {
      el.style.transition = 'none'
      el.style.transform = own.transform
    }
    return () => {
      for (const [el, own] of saved) el.style.transition = own.transition
      saved.clear()
      applied.clear()
    }
  }

  const unhideSource = () => {
    for (const el of document.querySelectorAll('[data-builder-drag-source]')) el.removeAttribute('data-builder-drag-source')
    source = null
  }

  const removeGhost = () => {
    cancelAnimationFrame(frame)
    frame = 0
    ghost?.box.remove()
    ghost = null
  }

  /** Ends everything at once: no animation. */
  const reset = () => {
    window.clearTimeout(settleTimer)
    if (pending) window.clearTimeout(pending.timer)
    pending = null
    removeGhost()
    unhideSource()
    restoreAll()()
    pointer = null
    active = false
  }

  // -------------------------------------------------------------------------
  // The lifted copy
  // -------------------------------------------------------------------------

  const pose = (g: Ghost, now: number) => {
    const p = pointer ?? { x: g.home.x, y: g.home.y }
    const follow = {
      x: p.x - g.anchor.x * g.width,
      y: p.y - g.anchor.y * g.height,
      scale: g.fit * LIFT,
    }
    if (g.liftAt === null) return { ...follow, lift: 1 }
    const t = Math.min(1, springAt(SETTLE, (now - g.liftAt) / 1000))
    // Origin is the anchor: the copy at its home has a translate of its rect minus nothing.
    return {
      x: g.home.x + (follow.x - g.home.x) * t,
      y: g.home.y + (follow.y - g.home.y) * t,
      scale: 1 + (follow.scale - 1) * t,
      lift: t,
    }
  }

  const draw = (now: number) => {
    frame = 0
    const g = ghost
    if (!g) return
    // Tilt follows the sideways speed, smoothed, and settles back when the pointer rests.
    if (pointer) {
      const last = g.last
      const dt = last ? Math.max(1, now - last.t) : 16
      const vx = last ? (pointer.x - last.x) / dt : 0
      const target = Math.max(-MAX_TILT, Math.min(MAX_TILT, vx * 2.4))
      g.tilt += (target - g.tilt) * 0.16
      g.last = { x: pointer.x, y: pointer.y, t: now }
    }
    const { x, y, scale, lift } = pose(g, now)
    const tilt = g.tilt * lift
    g.box.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${tilt.toFixed(2)}deg)`
    frame = requestAnimationFrame(draw)
  }

  const lift = (drag: CanvasDragStart, el: HTMLElement) => {
    const rect = toRect(el.getBoundingClientRect())
    if (rect.width === 0 || rect.height === 0) return
    const style = getComputedStyle(el)
    const box = document.createElement('div')
    box.setAttribute('data-builder-drag-ghost', '')
    box.setAttribute('aria-hidden', 'true')
    const anchor = { x: Math.min(1, Math.max(0, drag.anchor.x)), y: Math.min(1, Math.max(0, drag.anchor.y)) }
    const fit = Math.min(1, drag.maxSize.width / rect.width, drag.maxSize.height / rect.height)
    Object.assign(box.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      zIndex: '2147483647',
      borderRadius: '8px',
      background: backgroundOf(el),
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      textAlign: style.textAlign,
      transformOrigin: `${anchor.x * rect.width}px ${anchor.y * rect.height}px`,
      transform: `translate3d(${rect.x}px, ${rect.y}px, 0)`,
      boxShadow: SHADOW_LIFTED,
      transition: 'opacity 140ms ease-out, box-shadow 200ms ease-out',
      willChange: 'transform',
      opacity: '0',
    })
    const copy = copyOf(el)
    copy.style.margin = '0'
    copy.style.width = `${rect.width}px`
    copy.style.transform = 'none'
    box.append(copy)
    document.body.append(box)
    ghost = { box, width: rect.width, height: rect.height, anchor, fit, home: rect, liftAt: null, tilt: 0, last: null }
  }

  const showGhost = (visible: boolean) => {
    const g = ghost
    if (!g) return
    const opacity = visible ? '1' : '0'
    if (g.box.style.opacity === opacity) return
    // The first time it shows under a pointer inside the canvas, it lifts from the block.
    if (visible && g.liftAt === null && !g.last) g.liftAt = performance.now()
    g.box.style.opacity = opacity
    if (!frame) frame = requestAnimationFrame(draw)
  }

  // -------------------------------------------------------------------------
  // Drop: FLIP every block that moved
  // -------------------------------------------------------------------------

  const runDrop = (drop: PendingDrop) => {
    window.clearTimeout(drop.timer)
    pending = null
    removeGhost()
    unhideSource()
    const finishRestore = restoreAll()
    elements = blockElements(root())
    const last = new Map<string, Rect>()
    for (const [id, el] of elements) last.set(id, toRect(el.getBoundingClientRect()))
    finishRestore()

    const view: Rect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
    const moved = new Set(drop.ids)
    // Absolute FLIP of each animated element. A child animates only by its own share.
    const done = new Map<Element, Flip | 'scaled'>()
    const animations: Animation[] = []
    const ancestorFlip = (el: HTMLElement): Flip | 'scaled' | null => {
      for (let node = el.parentElement?.closest('[data-block-id]'); node; node = node.parentElement?.closest('[data-block-id]')) {
        const flip = done.get(node)
        if (flip) return flip
      }
      return null
    }
    const play = (el: HTMLElement, keyframes: Keyframe[]) => {
      animations.push(el.animate(keyframes, { duration: SETTLE.duration, easing: SETTLE_EASING }))
    }
    for (const [id, el] of elements) {
      const to = last.get(id)
      if (!to) continue
      const above = ancestorFlip(el)
      if (above === 'scaled') continue
      const own = el.style.transform || 'none'
      const from = moved.has(id) ? (drop.from ?? drop.first.get(id)) : drop.first.get(id)
      if (!from) {
        // A block that was not on the canvas before (inserted from the library): grows out of the gap.
        if (above || !drop.placeholder) continue
        const flip = flipFrom(drop.placeholder, to, true)
        done.set(el, 'scaled')
        play(el, [
          { transform: `${flipTransform(flip)} ${own === 'none' ? '' : own}`.trim(), transformOrigin: '0 0', opacity: 0 },
          { transform: own, transformOrigin: '0 0', opacity: 1 },
        ])
        continue
      }
      const flip = flipFrom(from, to, moved.has(id))
      const base = above ?? { x: 0, y: 0, scale: 1 }
      const rel: Flip = { x: flip.x - base.x, y: flip.y - base.y, scale: flip.scale }
      if (isStill(rel)) continue
      done.set(el, moved.has(id) ? 'scaled' : flip)
      if (!intersects(from, view) && !intersects(to, view)) continue
      play(el, [
        { transform: `${flipTransform(rel)} ${own === 'none' ? '' : own}`.trim(), transformOrigin: '0 0' },
        { transform: own, transformOrigin: '0 0' },
      ])
    }
    active = false
    pointer = null
    void Promise.allSettled(animations.map((a) => a.finished)).then(onSettled)
    if (animations.length === 0) onSettled()
  }

  const cancel = () => {
    if (pending) window.clearTimeout(pending.timer)
    pending = null
    for (const el of applied.keys()) slide(el, '')
    const g = ghost
    const home = source && source.isConnected ? toRect(source.getBoundingClientRect()) : null
    if (g && home && g.box.style.opacity === '1') {
      cancelAnimationFrame(frame)
      frame = 0
      g.box.style.transition = `transform ${SETTLE.duration}ms ${SETTLE_EASING}, box-shadow ${SETTLE.duration}ms ease-out`
      g.box.style.boxShadow = SHADOW_RESTING
      // The origin is the anchor, so a plain translate puts the copy exactly on its block.
      g.box.style.transform = `translate3d(${home.x}px, ${home.y}px, 0)`
    } else {
      removeGhost()
    }
    active = false
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      removeGhost()
      unhideSource()
      restoreAll()()
      onSettled()
    }, Math.max(SETTLE.duration, MAKE_ROOM.duration))
  }

  return {
    start(drag) {
      reset()
      active = true
      elements = blockElements(root())
      startScroll = { x: window.scrollX, y: window.scrollY }
      startRects = new Map([...elements.values()].map((el) => [el, toRect(el.getBoundingClientRect())]))
      const el = drag.sourceId ? elements.get(drag.sourceId) : undefined
      if (!el) return
      source = el
      if (drag.lift) lift(drag, el)
      el.setAttribute('data-builder-drag-source', '')
    },

    preview(offsets) {
      if (!active) return
      const next = new Set<HTMLElement>()
      for (const [id, d] of Object.entries(offsets)) {
        const el = elements.get(id)
        if (!el) continue
        next.add(el)
        slide(el, `translate3d(${Math.round(d.x * 100) / 100}px, ${Math.round(d.y * 100) / 100}px, 0)`, d)
      }
      for (const el of applied.keys()) if (!next.has(el)) slide(el, '')
    },

    pointer(x, y, inside) {
      if (!active) return
      pointer = { x, y, inside }
      showGhost(inside)
    },

    end(drop, ids, placeholder, card) {
      if (!drop) {
        if (active || pending) cancel()
        return
      }
      if (!active) return
      const first = new Map<string, Rect>()
      for (const [id, el] of elements) first.set(id, toRect(el.getBoundingClientRect()))
      const from = ghost && ghost.box.style.opacity === '1' ? toRect(ghost.box.getBoundingClientRect()) : (card ?? placeholder)
      cancelAnimationFrame(frame)
      frame = 0
      active = false
      pending = { first, from, ids, placeholder, layout: layout(), timer: window.setTimeout(cancel, DROP_WAIT_MS) }
    },

    rendered(current) {
      if (pending && current !== pending.layout) runDrop(pending)
    },

    dispose: reset,
  }
}
