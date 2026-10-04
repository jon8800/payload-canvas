'use client'

// Smooth drag mode in the admin: the outline rows and the canvas blocks move out of the way while
// a block is dragged, and a lifted copy follows the pointer. The drop target still comes from
// `core/dropTarget.ts` and the drop is still one `move` or `insert` operation.
//
// Displaced elements must never feed back into the drop target, so hit testing uses the rects
// measured when the drag started: the canvas measurement moved by the canvas scroll, and the
// outline rows in their lifted order moved by the outline scroll.
//
// The canvas side lives in `builder-react/src/canvas/drag.ts`; the messages are in `protocol`.

import { flushSync } from 'react-dom'

import { canvasDropTarget, findBlock, findLocation, outlineDropTarget } from '../../../core'
import type { CanvasMeasurement, DragSource, DropTarget, Layout, OutlineRow, Point, Rect } from '../../../core/types'
import {
  flipFrom,
  flipTransform,
  intersects,
  isStill,
  MAKE_ROOM,
  rectContains,
  SETTLE,
  springEasing,
} from '../../../protocol'
import { computeDrop, OUTLINE_INDENT, toRect, type DragData, type DragState, type Runtime } from '../runtime'
import { createValueStore, type ValueStore } from '../valueStore'
import {
  canvasPreview,
  childRows,
  liftRows,
  outlinePreview,
  previewRowOrder,
  scrolledMeasurement,
  type FlatRow,
  type Offsets,
} from './displace'
import { dragMode } from './mode'

/** CSS `linear()` easings for the editor's own CSS (set as variables on the editor root). */
export const MAKE_ROOM_EASING = springEasing(MAKE_ROOM)
export const SETTLE_EASING = springEasing(SETTLE)

/** The lifted copy in the canvas is at most this big on screen, in pixels. */
const CANVAS_GHOST_MAX = { width: 420, height: 300 }
/** Where the pointer holds the canvas copy when the drag did not start on the canvas. */
const DEFAULT_ANCHOR = { x: 0.06, y: 0.1 }
/** Where the pointer holds the admin copy when the drag did not start on an outline row. */
const DEFAULT_GRAB = { x: 18, y: 14 }

/** What the overlay and the drag layer draw during a smooth drag (and while it settles). */
export type SmoothView = {
  phase: 'drag' | 'settle'
  /** The gap in the canvas, in the coordinates of `baseScroll`. */
  placeholder: Rect | null
  /** The canvas scroll when the drag started. Draw the gap moved by the scroll since. */
  baseScroll: Point
  /** Block label for "Into …" when the drop goes into a container. */
  into: string | null
  ghost: { label: string; icon?: string; width: number | null; grab: Point }
}

type OutlineState = {
  el: HTMLElement
  rect: Rect
  /** Rows as measured at the start, top from the list content's top. */
  rows: FlatRow[]
  lifted: FlatRow[]
  rowX: number
  rowWidth: number
  scrollTop: number
  elements: Map<string, HTMLElement>
  written: Map<string, string>
  /** The vertical offset written for each row. */
  offsetY: Map<string, number>
  gap: HTMLElement | null
  into: HTMLElement | null
  onScroll: () => void
}

type Session = {
  source: DragSource
  data: DragData
  layout: Layout
  base: CanvasMeasurement | null
  scrolled: CanvasMeasurement | null
  frame: { rect: Rect; scale: number } | null
  canvasGhost: boolean
  outline: OutlineState | null
  targetKey: string
  ghost: HTMLElement | null
  /** Pointer offset inside the admin copy. */
  grab: Point
  ghostHidden: boolean
  ghostRefused: boolean
  pointer: Point | null
  zone: DragState['zone']
  stop: () => void
}

type Controller = { view: ValueStore<SmoothView | null>; session: Session | null; settleTimer: number }

const controllers = new WeakMap<Runtime, Controller>()

function controllerOf(runtime: Runtime): Controller {
  let c = controllers.get(runtime)
  if (!c) {
    c = { view: createValueStore<SmoothView | null>(null), session: null, settleTimer: 0 }
    controllers.set(runtime, c)
  }
  return c
}

/** What the overlay and drag layer draw. Null outside a smooth drag. */
export function smoothView(runtime: Runtime): ValueStore<SmoothView | null> {
  return controllerOf(runtime).view
}

/** True while a smooth drag is in progress. */
export function isSmoothDrag(runtime: Runtime): boolean {
  return controllerOf(runtime).session !== null
}

/** The admin ghost element (rendered by the drag layer) registers here. */
export function registerGhost(runtime: Runtime, el: HTMLElement | null) {
  const session = controllerOf(runtime).session
  if (session) {
    session.ghost = el
    if (el && session.pointer) placeGhost(session)
  }
}

const targetKey = (target: DropTarget | null) =>
  !target || target.noop ? 'none' : `${target.to.parentId ?? ''}\u0000${target.to.slot}\u0000${target.to.index}`

/**
 * Starts a smooth drag if the user's drag mode is smooth. `pointer` is where the drag started,
 * `rect` the box of the element it started on, `fromOutline` true for an outline row.
 */
export function startSmoothDrag(
  runtime: Runtime,
  data: DragData,
  start: { pointer: Point | null; rect: Rect | null; fromOutline: boolean },
): boolean {
  const controller = controllerOf(runtime)
  if (dragMode(runtime) !== 'smooth') return false
  finishSettle(runtime)
  const { source } = data
  const layout = runtime.store.getState().layout
  const base = runtime.measurement.get()
  const iframe = runtime.iframeRef.current
  const frame = iframe ? frameBox(iframe) : null
  const sourceRect = source.kind === 'block' ? base?.blocks.find((b) => b.id === source.id)?.rect : undefined
  const outline = measureOutline(runtime, source)
  const fromRow = start.fromOutline && start.rect !== null
  const grab = fromRow && start.pointer && start.rect ? { x: start.pointer.x - start.rect.x, y: start.pointer.y - start.rect.y } : DEFAULT_GRAB

  const session: Session = {
    source,
    data,
    layout,
    base,
    scrolled: base,
    frame,
    canvasGhost: Boolean(sourceRect),
    outline,
    targetKey: '',
    ghost: null,
    grab,
    ghostHidden: false,
    ghostRefused: false,
    pointer: start.pointer,
    zone: null,
    stop: () => {},
  }
  controller.session = session

  // The canvas: hide the block and lift a copy of it.
  let anchor = DEFAULT_ANCHOR
  if (sourceRect && frame && start.pointer && rectContains(frame.rect, start.pointer.x, start.pointer.y)) {
    const local = toFrame(frame, start.pointer)
    anchor = {
      x: clamp01((local.x - sourceRect.x) / sourceRect.width),
      y: clamp01((local.y - sourceRect.y) / sourceRect.height),
    }
  }
  const zoom = frame?.scale || 1
  runtime.postToCanvas({
    type: 'dragStart',
    drag: {
      sourceId: source.kind === 'block' ? source.id : null,
      anchor,
      maxSize: { width: CANVAS_GHOST_MAX.width / zoom, height: CANVAS_GHOST_MAX.height / zoom },
    },
  })

  // The outline: the dragged row becomes the gap; its children hide under it.
  if (outline) {
    outline.el.classList.add('builder-dnd-outline--active')
    if (source.kind === 'block') outline.elements.get(source.id)?.setAttribute('data-dnd-source', '')
    for (const id of childRows(outline.rows, source.kind === 'block' ? source.id : null)) outline.elements.get(id)?.setAttribute('data-dnd-hidden', '')
  }
  applyPreview(runtime, session, null)

  controller.view.set({
    phase: 'drag',
    placeholder: sourceRect ?? null,
    baseScroll: base?.scroll ?? { x: 0, y: 0 },
    into: null,
    ghost: { label: data.label, icon: data.icon, width: fromRow && start.rect ? start.rect.width : null, grab },
  })

  const unsubscribeDrag = runtime.drag.subscribe(() => {
    const state = runtime.drag.get()
    if (state && controller.session === session) onDragState(runtime, session, state)
  })
  // Another editor (or the assistant) changed the layout: the measured rects are stale. Finish this
  // drag with the drop indicator.
  const unsubscribeStore = runtime.store.subscribe(() => {
    if (controller.session === session && runtime.store.getState().layout !== session.layout) abortSmooth(runtime)
  })
  session.stop = () => {
    unsubscribeDrag()
    unsubscribeStore()
    if (outline) outline.el.removeEventListener('scroll', outline.onScroll)
  }
  return true
}

/**
 * The drop zone and target under the pointer. In a smooth drag it uses the rects from the start
 * of the drag; otherwise it is `computeDrop`.
 */
export function dropAt(runtime: Runtime, p: Point, source: DragSource): Pick<DragState, 'zone' | 'target'> {
  const session = controllerOf(runtime).session
  if (!session) return computeDrop(runtime, p, source)
  const { layout } = session
  const { blocks } = runtime.config
  const outline = session.outline
  if (outline && rectContains(outline.rect, p.x, p.y)) {
    const rows: OutlineRow[] = outline.lifted.map((r) => ({
      id: r.id,
      depth: r.depth,
      rect: { x: outline.rowX, y: outline.rect.y + r.top - outline.scrollTop, width: outline.rowWidth, height: r.height },
    }))
    const target = outlineDropTarget(layout, blocks, rows, p, source, OUTLINE_INDENT)
    if (target || source.kind !== 'block') return { zone: 'outline', target }
    // Over its own row: the block stays where it is.
    const own = rows.find((r) => r.id === source.id)
    const at = findLocation(layout, source.id)
    if (own && at && rectContains(own.rect, p.x, p.y)) {
      return { zone: 'outline', target: { to: { parentId: at.parentId, slot: at.slot, index: at.index }, indicator: { kind: 'line', rect: own.rect }, noop: true } }
    }
    return { zone: 'outline', target: null }
  }
  if (session.frame && session.base) {
    if (rectContains(session.frame.rect, p.x, p.y)) {
      const local = toFrame(session.frame, p)
      const measurement = scrolledFor(runtime, session)
      return { zone: 'canvas', target: canvasDropTarget(layout, blocks, measurement, local, source) }
    }
  }
  return { zone: null, target: null }
}

/**
 * Ends a smooth drag. `commit` applies the drop and returns false when the edit was refused.
 * `endDrag` clears the drag state; it runs before the commit so rows render without the drag.
 */
export function endSmoothDrag(runtime: Runtime, commit: (() => boolean) | null, endDrag: () => void) {
  const controller = controllerOf(runtime)
  const session = controller.session
  if (!session) {
    endDrag()
    commit?.()
    return
  }
  const smooth = controller.view.get()
  if (!commit) {
    endDrag()
    cancelSmooth(runtime, session)
    return
  }
  const outline = session.outline
  // FIRST: where everything is on screen now.
  const first = new Map<string, Rect>()
  if (outline) for (const [id, el] of outline.elements) first.set(id, toRect(el.getBoundingClientRect()))
  const ghostRect = session.ghost && !session.ghostHidden ? toRect(session.ghost.getBoundingClientRect()) : null
  const placeholder = smooth?.placeholder && session.base ? shiftRect(smooth.placeholder, scrollDelta(runtime, session)) : null
  runtime.postToCanvas({ type: 'dragEnd', drop: true, ids: session.source.kind === 'block' ? [session.source.id] : [], placeholder })
  controller.session = null
  session.stop()

  let ok = false
  flushSync(() => {
    endDrag()
    ok = commit()
  })
  if (!ok) {
    runtime.postToCanvas({ type: 'dragEnd', drop: false, ids: [], placeholder: null })
    controller.session = session
    cancelSmooth(runtime, session)
    return
  }

  // LAST, INVERT, PLAY for the outline rows.
  if (outline) {
    clearOutline(outline, false)
    const sourceId = session.source.kind === 'block' ? session.source.id : null
    const rows = outline.el.querySelectorAll<HTMLElement>('[data-outline-row]')
    for (const el of rows) {
      const id = el.dataset.outlineRow ?? ''
      const last = toRect(el.getBoundingClientRect())
      if (!intersects(last, outline.rect)) continue
      const from = id === sourceId && ghostRect && session.zone === 'outline' ? ghostRect : first.get(id)
      if (!from) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' })
        continue
      }
      const flip = flipFrom(from, last)
      if (isStill(flip)) continue
      el.animate([{ transform: flipTransform(flip) }, { transform: 'none' }], { duration: SETTLE.duration, easing: SETTLE_EASING })
    }
  }

  // The admin copy: over the canvas with no copy there (a new block), it flies into the gap.
  const ghost = session.ghost
  if (ghost && !session.ghostHidden && session.zone === 'canvas' && placeholder && session.frame) {
    const target = toScreen(session.frame, placeholder)
    const now = toRect(ghost.getBoundingClientRect())
    ghost.animate(
      [
        { transform: ghost.style.transform, opacity: 1 },
        { transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${Math.min(1.2, target.width / Math.max(1, now.width))})`, opacity: 0 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' },
    )
  } else if (ghost) {
    ghost.style.visibility = 'hidden'
  }
  settle(runtime, smooth)
}

/** Escape, or a drop outside any target. */
function cancelSmooth(runtime: Runtime, session: Session) {
  const controller = controllerOf(runtime)
  controller.session = null
  session.stop()
  runtime.postToCanvas({ type: 'dragEnd', drop: false, ids: [], placeholder: null })
  const outline = session.outline
  if (outline) {
    // Rows slide back with the transition still on, then the class goes.
    for (const el of outline.elements.values()) {
      el.style.transform = ''
      el.removeAttribute('data-dnd-hidden')
    }
    window.setTimeout(() => {
      for (const el of outline.elements.values()) el.style.transition = ''
    }, MAKE_ROOM.duration)
    outline.gap?.remove()
    outline.into?.removeAttribute('data-dnd-into')
  }
  const ghost = session.ghost
  const home = session.source.kind === 'block' ? outline?.elements.get(session.source.id) : undefined
  if (ghost && !session.ghostHidden) {
    const rect = home ? toRect(home.getBoundingClientRect()) : null
    const visible = rect && outline && intersects(rect, outline.rect)
    ghost.animate(
      visible && rect
        ? [{ transform: ghost.style.transform }, { transform: `translate3d(${rect.x}px, ${rect.y}px, 0)` }]
        : [{ opacity: 1 }, { opacity: 0 }],
      { duration: visible ? SETTLE.duration : 160, easing: visible ? SETTLE_EASING : 'ease-out', fill: 'forwards' },
    )
  }
  settle(runtime, controller.view.get(), () => {
    if (!outline) return
    outline.el.classList.remove('builder-dnd-outline--active')
    home?.removeAttribute('data-dnd-source')
    home?.removeAttribute('data-dnd-gone')
    home?.style.removeProperty('--dnd-indent')
  })
}

/** Another edit arrived during the drag: stop moving things, finish with the drop indicator. */
function abortSmooth(runtime: Runtime) {
  const controller = controllerOf(runtime)
  const session = controller.session
  if (!session) return
  controller.session = null
  session.stop()
  runtime.postToCanvas({ type: 'dragEnd', drop: false, ids: [], placeholder: null })
  if (session.outline) clearOutline(session.outline, true)
  controller.view.set(null)
}

/** Keeps the view (and the ghost element) a moment for the drop or cancel animation. */
function settle(runtime: Runtime, view: SmoothView | null, done?: () => void) {
  const controller = controllerOf(runtime)
  window.clearTimeout(controller.settleTimer)
  controller.view.set(view ? { ...view, phase: 'settle' } : null)
  controller.settleTimer = window.setTimeout(() => {
    done?.()
    if (!controller.session) controller.view.set(null)
  }, Math.max(SETTLE.duration, MAKE_ROOM.duration))
}

/** A new drag during the settle animation: finish it now. */
function finishSettle(runtime: Runtime) {
  const controller = controllerOf(runtime)
  window.clearTimeout(controller.settleTimer)
  controller.view.set(null)
  const outline = runtime.outlineRef.current
  if (!outline) return
  outline.classList.remove('builder-dnd-outline--active')
  for (const el of outline.querySelectorAll<HTMLElement>('[data-dnd-source], [data-dnd-hidden], [data-dnd-into], [data-dnd-gone]')) {
    el.removeAttribute('data-dnd-gone')
    el.removeAttribute('data-dnd-source')
    el.removeAttribute('data-dnd-hidden')
    el.removeAttribute('data-dnd-into')
  }
  for (const el of outline.querySelectorAll<HTMLElement>('[data-outline-row]')) {
    el.style.transform = ''
    el.style.transition = ''
    el.style.removeProperty('--dnd-indent')
  }
  outline.querySelector('.builder-dnd-gap-row')?.remove()
}

// ---------------------------------------------------------------------------
// While dragging
// ---------------------------------------------------------------------------

function onDragState(runtime: Runtime, session: Session, state: DragState) {
  session.pointer = state.pointer
  session.zone = state.zone
  if (session.ghost) placeGhost(session)
  const refused = state.zone !== null && !state.target
  if (refused !== session.ghostRefused) {
    session.ghostRefused = refused
    session.ghost?.toggleAttribute('data-refused', refused)
  }
  if (state.pointer && session.canvasGhost && session.frame) {
    const local = toFrame(session.frame, state.pointer)
    runtime.postToCanvas({ type: 'dragPointer', x: local.x, y: local.y, inside: state.zone === 'canvas' })
  }
  const key = targetKey(state.target)
  if (key !== session.targetKey) applyPreview(runtime, session, state.target)
}

function placeGhost(session: Session) {
  const ghost = session.ghost
  const p = session.pointer
  if (!ghost || !p) return
  const { grab } = session
  ghost.style.transform = `translate3d(${p.x - grab.x}px, ${p.y - grab.y}px, 0)`
  // Over the canvas, the canvas shows its own copy of the block.
  const hidden = session.zone === 'canvas' && session.canvasGhost
  if (hidden !== session.ghostHidden) {
    session.ghostHidden = hidden
    ghost.toggleAttribute('data-hidden', hidden)
  }
}

function applyPreview(runtime: Runtime, session: Session, target: DropTarget | null) {
  session.targetKey = targetKey(target)
  const { source, layout } = session
  const controller = controllerOf(runtime)

  // Canvas
  if (session.base) {
    const preview = canvasPreview(layout, session.base, source, target)
    runtime.postToCanvas({ type: 'dragPreview', offsets: Object.fromEntries(preview.offsets) })
    const view = controller.view.get()
    const into = target && !target.noop && target.indicator.kind === 'box' && target.to.parentId ? target.to.parentId : null
    const intoBlock = into ? findBlock(layout, into) : null
    if (view) controller.view.set({ ...view, placeholder: preview.placeholder, into: intoBlock ? runtime.blockLabel(intoBlock.type) : null })
  }

  // Outline
  const outline = session.outline
  if (!outline) return
  const sourceId = source.kind === 'block' ? source.id : null
  const order = previewRowOrder(layout, runtime.collapsed.get(), source, target)
  const preview = outlinePreview(outline.rows, order, sourceId, OUTLINE_INDENT)
  // The dragged row moves only up and down; its gap shows the new depth by its indent.
  const sourceRow = sourceId ? outline.rows.find((r) => r.id === sourceId) : undefined
  const sourceOffset = sourceId ? preview.offsets.get(sourceId) : undefined
  if (sourceId && sourceRow) {
    if (sourceOffset) preview.offsets.set(sourceId, { x: 0, y: sourceOffset.y })
    const indent = sourceRow.depth * OUTLINE_INDENT + (sourceOffset?.x ?? 0)
    outline.elements.get(sourceId)?.style.setProperty('--dnd-indent', `${indent}px`)
  }
  writeRows(outline, preview.offsets)
  // A new block: a gap row where it lands.
  if (!sourceId) {
    if (preview.gap && order) {
      if (!outline.gap) {
        outline.gap = document.createElement('div')
        outline.gap.className = 'builder-dnd-gap-row'
        outline.el.append(outline.gap)
      }
      outline.gap.style.left = `${outline.rowX - outline.rect.x + preview.gap.depth * OUTLINE_INDENT}px`
      outline.gap.style.transform = `translate3d(0, ${preview.gap.top}px, 0)`
      outline.gap.style.height = `${preview.gap.height}px`
    } else {
      outline.gap?.remove()
      outline.gap = null
    }
  }
  // The drop goes into a collapsed block: the gap cannot show, so the block's row lights up.
  if (sourceId) outline.elements.get(sourceId)?.toggleAttribute('data-dnd-gone', Boolean(order && !preview.gap))
  const intoId = order && !preview.gap && target ? target.to.parentId : null
  const intoRow = intoId ? (outline.elements.get(intoId) ?? null) : null
  if (intoRow !== outline.into) {
    outline.into?.removeAttribute('data-dnd-into')
    intoRow?.setAttribute('data-dnd-into', '')
    outline.into = intoRow
  }
}

/** Rows this far outside the outline's view move at once, without an animation. */
const ROW_ANIMATE_MARGIN = 120

function writeRows(outline: OutlineState, offsets: Offsets) {
  const top = outline.scrollTop - ROW_ANIMATE_MARGIN
  const bottom = outline.scrollTop + outline.rect.height + ROW_ANIMATE_MARGIN
  const tops = new Map(outline.rows.map((r) => [r.id, r.top]))
  for (const [id, el] of outline.elements) {
    const d = offsets.get(id)
    const value = d ? `translate3d(${d.x}px, ${d.y}px, 0)` : ''
    if ((outline.written.get(id) ?? '') === value) continue
    const from = (tops.get(id) ?? 0) + (outline.offsetY.get(id) ?? 0)
    const to = (tops.get(id) ?? 0) + (d?.y ?? 0)
    const near = (from > top && from < bottom) || (to > top && to < bottom)
    el.style.transition = near ? '' : 'none'
    if (d) outline.offsetY.set(id, d.y)
    else outline.offsetY.delete(id)
    el.style.transform = value
    if (value) outline.written.set(id, value)
    else outline.written.delete(id)
  }
}

/** Removes every drag mark and transform from the outline rows at once. */
function clearOutline(outline: OutlineState, keepTransition: boolean) {
  if (!keepTransition) outline.el.classList.remove('builder-dnd-outline--active')
  for (const el of outline.el.querySelectorAll<HTMLElement>('[data-outline-row]')) {
    el.style.transform = ''
    el.style.transition = ''
    el.style.removeProperty('--dnd-indent')
    el.removeAttribute('data-dnd-source')
    el.removeAttribute('data-dnd-hidden')
    el.removeAttribute('data-dnd-into')
    el.removeAttribute('data-dnd-gone')
  }
  outline.gap?.remove()
  outline.gap = null
  if (keepTransition) window.setTimeout(() => outline.el.classList.remove('builder-dnd-outline--active'), MAKE_ROOM.duration)
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

function measureOutline(runtime: Runtime, source: DragSource): OutlineState | null {
  const el = runtime.outlineRef.current
  if (!el) return null
  const box = toRect(el.getBoundingClientRect())
  const scrollTop = el.scrollTop
  const elements = new Map<string, HTMLElement>()
  const rows: FlatRow[] = []
  let rowX = box.x
  let rowWidth = box.width
  for (const row of el.querySelectorAll<HTMLElement>('[data-outline-row]')) {
    const id = row.dataset.outlineRow ?? ''
    const rect = row.getBoundingClientRect()
    elements.set(id, row)
    if (rows.length === 0) {
      rowX = rect.x
      rowWidth = rect.width
    }
    rows.push({ id, depth: Number(row.dataset.depth ?? 0), top: rect.top - box.y + scrollTop, height: rect.height })
  }
  const state: OutlineState = {
    el,
    rect: box,
    rows,
    lifted: liftRows(rows, source.kind === 'block' ? source.id : null),
    rowX,
    rowWidth,
    scrollTop,
    elements,
    written: new Map(),
    offsetY: new Map(),
    gap: null,
    into: null,
    onScroll: () => {
      state.scrollTop = el.scrollTop
    },
  }
  el.addEventListener('scroll', state.onScroll, { passive: true })
  return state
}

/** The iframe's box on screen and its zoom. */
function frameBox(iframe: HTMLIFrameElement): { rect: Rect; scale: number } {
  const rect = toRect(iframe.getBoundingClientRect())
  return { rect, scale: iframe.offsetWidth ? rect.width / iframe.offsetWidth : 1 }
}

function toFrame(frame: { rect: Rect; scale: number }, p: Point): Point {
  return { x: (p.x - frame.rect.x) / frame.scale, y: (p.y - frame.rect.y) / frame.scale }
}

function toScreen(frame: { rect: Rect; scale: number }, r: Rect): Rect {
  return { x: frame.rect.x + r.x * frame.scale, y: frame.rect.y + r.y * frame.scale, width: r.width * frame.scale, height: r.height * frame.scale }
}

function scrollDelta(runtime: Runtime, session: Session): Point {
  const now = runtime.measurement.get()?.scroll
  const start = session.base?.scroll
  return now && start ? { x: now.x - start.x, y: now.y - start.y } : { x: 0, y: 0 }
}

function shiftRect(r: Rect, d: Point): Rect {
  return { ...r, x: r.x - d.x, y: r.y - d.y }
}

/** The start measurement moved by the canvas scroll. Cached until the canvas scrolls again. */
function scrolledFor(runtime: Runtime, session: Session): CanvasMeasurement {
  const base = session.base as CanvasMeasurement
  const scroll = runtime.measurement.get()?.scroll ?? base.scroll
  const cached = session.scrolled
  if (cached && cached.scroll.x === scroll.x && cached.scroll.y === scroll.y) return cached
  session.scrolled = scrolledMeasurement(base, scroll)
  return session.scrolled
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
