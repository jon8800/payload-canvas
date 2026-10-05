'use client'

// Handles on the left and right edge of the canvas frame (Webflow-style). Drag one to resize the
// frame: it stays centered, so both edges move. Shift snaps to breakpoint and device widths. A
// double-click (or Enter) goes back to the device the drag started from, else to fluid.
// While dragging, the handles write the frame's width straight to the DOM on each animation
// frame. React does not render; the store gets the width on pointer up.

import { useMemo, useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

import { useRuntime } from '../runtime'
import { useEditor } from '../store'
import { breakpointAt, breakpointWidths, useStyleTokens, withFallback } from '../styles/tokens'
import { DEVICE_WIDTHS, deviceForWidth, MAX_CANVAS_WIDTH, MIN_CANVAS_WIDTH } from '../styles/viewport'
import { KEY_STEP, KEY_STEP_LARGE } from './panels'
import { resizedWidth, type ResizeStart } from './frameWidth'

type Drag = ResizeStart & {
  pointerId: number
  x: number
  next: number
  frame: number
  /** The inline styles before the drag, put back before the store renders the new width. */
  styles: { wrap: string; frame: string }
}

type FrameResizeProps = {
  wrapRef: RefObject<HTMLDivElement | null>
  frameRef: RefObject<HTMLDivElement | null>
  /** Frame width in CSS px and its zoom. */
  frameWidth: number
  zoom: number
  /** The stage width in screen px: the widest the frame may get on screen. */
  space: number
}

export function FrameResize({ wrapRef, frameRef, frameWidth, zoom, space }: FrameResizeProps) {
  const runtime = useRuntime()
  const { store } = runtime
  const width = useEditor(store, (s) => s.canvasWidth)
  const { tokens } = useStyleTokens(runtime.config.tokensEndpoint)
  const widths = useMemo(() => breakpointWidths(withFallback(tokens)), [tokens])
  const snaps = useMemo(
    () => [...new Set([...Object.values(widths), ...Object.values(DEVICE_WIDTHS)].filter((w): w is number => typeof w === 'number' && w > 0))],
    [widths],
  )
  const labelRef = useRef<HTMLOutputElement>(null)
  const drag = useRef<Drag | null>(null)
  // The device (or fluid, `null`) the first drag started from. A double-click goes back to it.
  const origin = useRef<number | null>(null)
  const label = (px: number) => `${px} px · ${breakpointAt(widths, px)}`

  /** Back to the device the drag started from; from a device (or fluid), to fluid. */
  const reset = () => {
    const next = deviceForWidth(width) === null ? origin.current : null
    origin.current = null
    store.setCanvasWidth(next)
  }

  const show = (current: Drag) => {
    const wrap = wrapRef.current
    const frame = frameRef.current
    if (wrap) wrap.style.width = `${current.next * current.zoom}px`
    if (frame) frame.style.width = `${current.next}px`
    if (labelRef.current) labelRef.current.textContent = label(current.next)
  }

  const onPointerDown = (side: -1 | 1) => (e: PointerEvent<HTMLHRElement>) => {
    if (e.button !== 0 || !frameWidth) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    // A device width (or fluid) is where a double-click goes back to.
    if (deviceForWidth(width) !== null) origin.current = width
    drag.current = {
      width: Math.round(frameWidth),
      zoom,
      side,
      space,
      pointerId: e.pointerId,
      x: e.clientX,
      next: Math.round(frameWidth),
      frame: 0,
      styles: { wrap: wrapRef.current?.style.width ?? '', frame: frameRef.current?.style.width ?? '' },
    }
    // The iframe must not take the pointer; no eased zoom while the frame follows the pointer.
    runtime.pointerLock.set(true)
    const root = e.currentTarget.closest<HTMLElement>('.builder-editor')
    if (root) root.dataset.resizing = 'x'
    if (labelRef.current) {
      labelRef.current.textContent = label(drag.current.next)
      labelRef.current.hidden = false
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLHRElement>) => {
    const current = drag.current
    if (!current || e.pointerId !== current.pointerId) return
    current.next = resizedWidth(current, e.clientX - current.x, e.shiftKey ? snaps : [])
    // One style write per frame, however fast the pointer moves.
    if (current.frame) return
    current.frame = requestAnimationFrame(() => {
      current.frame = 0
      if (drag.current === current) show(current)
    })
  }

  const end = (e: PointerEvent<HTMLHRElement>) => {
    const current = drag.current
    if (!current) return
    drag.current = null
    cancelAnimationFrame(current.frame)
    if (wrapRef.current) wrapRef.current.style.width = current.styles.wrap
    if (frameRef.current) frameRef.current.style.width = current.styles.frame
    if (labelRef.current) labelRef.current.hidden = true
    delete e.currentTarget.closest<HTMLElement>('.builder-editor')?.dataset.resizing
    runtime.pointerLock.set(false)
    if (current.next !== current.width) store.setCanvasWidth(current.next)
  }

  const onKeyDown = (side: -1 | 1) => (e: KeyboardEvent<HTMLHRElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      reset()
      return
    }
    // Away from the center grows the frame.
    const away = side === 1 ? 'ArrowRight' : 'ArrowLeft'
    const toward = side === 1 ? 'ArrowLeft' : 'ArrowRight'
    if (e.key !== away && e.key !== toward) return
    e.preventDefault()
    // Editor shortcuts (arrows move the selection) must not run.
    e.stopPropagation()
    if (deviceForWidth(width) !== null) origin.current = width
    const step = (e.shiftKey ? KEY_STEP_LARGE : KEY_STEP) * (e.key === away ? 1 : -1)
    const max = Math.min(MAX_CANVAS_WIDTH, Math.floor(space / (zoom || 1)))
    store.setCanvasWidth(Math.round(Math.min(Math.max(MIN_CANVAS_WIDTH, frameWidth + step), Math.max(MIN_CANVAS_WIDTH, max))))
  }

  const handle = (side: -1 | 1) => (
    // A focusable separator is a window splitter (WAI-ARIA): it takes the pointer and the keyboard.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <hr
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={`Canvas width, ${side === 1 ? 'right' : 'left'} edge. Arrow keys resize, Enter resets.`}
      aria-valuemin={MIN_CANVAS_WIDTH}
      aria-valuemax={MAX_CANVAS_WIDTH}
      aria-valuenow={Math.round(frameWidth)}
      data-tooltip="Drag to resize · Shift snaps · double-click to reset"
      data-tooltip-side={side === 1 ? 'left' : 'right'}
      className={`builder-frame-handle builder-frame-handle--${side === 1 ? 'right' : 'left'}`}
      onPointerDown={onPointerDown(side)}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={reset}
      onKeyDown={onKeyDown(side)}
    />
  )

  return (
    <>
      {handle(-1)}
      {handle(1)}
      <output ref={labelRef} className="builder-frame-handle__label" hidden />
    </>
  )
}
