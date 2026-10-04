'use client'

// A separator that resizes the panel next to it: drag it, use the arrow keys (Shift for larger
// steps, Home and End for the limits), or double-click it to go back to the default size.
// The drag writes one CSS variable per frame on the editor root. React does not render.

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react'

import { applySizes, clamp, KEY_STEP, KEY_STEP_LARGE, MIN_OUTLINE_HEIGHT, MIN_STAGE_WIDTH, PANELS, readSizes, writeSize, type PanelId } from './panels'

type Parts = { el: HTMLElement; target: HTMLElement; other: HTMLElement; root: HTMLElement }

type Drag = { pointerId: number; start: number; size: number; max: number; next: number; frame: number }

export function Splitter({
  panel,
  side,
  onActive,
}: {
  panel: PanelId
  /** Where the resized panel is: just `before` the separator (left, above) or `after` it. */
  side: 'before' | 'after'
  /** True while a pointer drags the separator. */
  onActive?: (active: boolean) => void
}) {
  const ref = useRef<HTMLHRElement>(null)
  const drag = useRef<Drag | null>(null)
  const spec = PANELS[panel]
  const horizontal = spec.axis === 'x'

  const parts = (): Parts | null => {
    const el = ref.current
    if (!el) return null
    const target = (side === 'before' ? el.previousElementSibling : el.nextElementSibling) as HTMLElement | null
    // The neighbour on the other side gives up the space (the canvas, or the outline).
    const other = (side === 'before' ? el.nextElementSibling : el.previousElementSibling) as HTMLElement | null
    const root = el.closest<HTMLElement>('.builder-editor')
    return target && other && root ? { el, target, other, root } : null
  }

  const sizeOf = (node: HTMLElement) => (horizontal ? node.getBoundingClientRect().width : node.getBoundingClientRect().height)

  /** The largest size: the panel may take the neighbour's space down to its minimum. */
  const maxOf = (p: Parts) => Math.min(spec.max, sizeOf(p.target) + sizeOf(p.other) - (horizontal ? MIN_STAGE_WIDTH : MIN_OUTLINE_HEIGHT))

  const apply = (p: Parts, px: number, max: number) => {
    const value = Math.round(clamp(px, spec.min, max))
    p.root.style.setProperty(spec.variable, `${value}px`)
    p.el.setAttribute('aria-valuenow', String(value))
    p.el.setAttribute('aria-valuemax', String(Math.round(Math.max(spec.min, max))))
    return value
  }

  // The current size for assistive tech, once the layout exists.
  useEffect(() => {
    const p = parts()
    if (!p) return
    p.el.setAttribute('aria-valuenow', String(Math.round(sizeOf(p.target))))
    p.el.setAttribute('aria-valuemax', String(Math.round(Math.max(spec.min, maxOf(p)))))
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reads the DOM once after mount
  }, [])

  useEffect(() => () => cancelAnimationFrame(drag.current?.frame ?? 0), [])

  const end = () => {
    const current = drag.current
    if (!current) return
    drag.current = null
    cancelAnimationFrame(current.frame)
    const p = parts()
    if (p) {
      writeSize(panel, apply(p, current.next, current.max))
      delete p.root.dataset.resizing
    }
    onActive?.(false)
  }

  const onPointerDown = (e: PointerEvent<HTMLHRElement>) => {
    if (e.button !== 0) return
    const p = parts()
    if (!p) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const size = sizeOf(p.target)
    drag.current = { pointerId: e.pointerId, start: horizontal ? e.clientX : e.clientY, size, max: maxOf(p), next: size, frame: 0 }
    p.root.dataset.resizing = spec.axis
    onActive?.(true)
  }

  const onPointerMove = (e: PointerEvent<HTMLHRElement>) => {
    const current = drag.current
    if (!current || e.pointerId !== current.pointerId) return
    const delta = (horizontal ? e.clientX : e.clientY) - current.start
    current.next = current.size + (side === 'before' ? delta : -delta)
    // One style write per frame, however fast the pointer moves.
    if (current.frame) return
    current.frame = requestAnimationFrame(() => {
      current.frame = 0
      const p = parts()
      if (p && drag.current === current) apply(p, current.next, current.max)
    })
  }

  const reset = () => {
    const p = parts()
    if (!p) return
    writeSize(panel, null)
    applySizes(p.root, readSizes())
    p.el.setAttribute('aria-valuenow', String(Math.round(sizeOf(p.target))))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLHRElement>) => {
    const p = parts()
    if (!p) return
    const keys = horizontal ? { less: 'ArrowLeft', more: 'ArrowRight' } : { less: 'ArrowUp', more: 'ArrowDown' }
    const size = sizeOf(p.target)
    const max = maxOf(p)
    const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP
    // Toward the panel shrinks it, away from it grows it.
    const grow = side === 'before' ? 1 : -1
    let next: number | null = null
    if (e.key === keys.more) next = size + step * grow
    else if (e.key === keys.less) next = size - step * grow
    else if (e.key === 'Home') next = spec.min
    else if (e.key === 'End') next = max
    else if (e.key === 'Enter') {
      e.preventDefault()
      reset()
      return
    }
    if (next === null) return
    e.preventDefault()
    // Editor shortcuts (arrows move the selection) must not run.
    e.stopPropagation()
    writeSize(panel, apply(p, next, max))
  }

  return (
    // A focusable separator is a window splitter (WAI-ARIA): it takes the pointer and the keyboard.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <hr
      ref={ref}
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-orientation={horizontal ? 'vertical' : 'horizontal'}
      aria-label={`${spec.label}. Arrow keys resize, Enter resets.`}
      aria-valuemin={spec.min}
      data-tooltip="Drag to resize · double-click to reset"
      // Away from the panel, over the canvas or the outline.
      data-tooltip-side={horizontal ? (side === 'before' ? 'right' : 'left') : 'bottom'}
      className={`builder-split builder-split--${spec.axis}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={reset}
      onKeyDown={onKeyDown}
    />
  )
}
