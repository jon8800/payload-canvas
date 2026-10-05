'use client'

import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ShimmerEffect, useConfig } from '@payloadcms/ui'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import type { BuilderClientConfig } from '../../core/types'
import type { BuilderDocMeta } from '../../live/types'
import { insertBlocks } from './actions'
import { Canvas } from './Canvas'
import { DragLayer } from './DragLayer'
import { dropAt, endSmoothDrag, isSmoothDrag, MAKE_ROOM_EASING, SETTLE_EASING, startSmoothDrag } from './dnd/smooth'
import { Inspector } from './Inspector'
import { LeftPanel } from './layout/LeftPanel'
import { applySizes, readSizes } from './layout/panels'
import { Splitter } from './layout/Splitter'
import './layout/layout.scss'
import './dnd/dnd.scss'
import { SectionDialog } from './sections/SectionDialog'
import { createRuntime, RuntimeContext, toCanvasPoint, type DragData, type DragState, type Runtime } from './runtime'
import { bindShortcuts } from './shortcuts'
import { cursorAt, useMultiplayer } from './live'
import { useFollow } from './live/useFollow'
import { useTemplateController } from './templates/useTemplate'
import { TopBar } from './topbar/TopBar'
import { useValueSelector } from './valueStore'

const COLLISION_ID = 'builder-drop'
/** Distance from the canvas top or bottom edge where auto-scroll starts. */
const AUTO_SCROLL_EDGE = 56
/** Pixels per tick at the very edge. Slower further from the edge. */
const AUTO_SCROLL_MAX_STEP = 22
const AUTO_SCROLL_TICK_MS = 16

/** Scrolls the iframe on a timer while the pointer rests near its top or bottom edge during a drag. */
function startAutoScroll(runtime: Runtime): () => void {
  const timer = window.setInterval(() => {
    const drag = runtime.drag.get()
    const iframe = runtime.iframeRef.current
    if (!drag?.pointer || drag.zone !== 'canvas' || !iframe) return
    const box = iframe.getBoundingClientRect()
    const fromTop = drag.pointer.y - box.top
    const fromBottom = box.bottom - drag.pointer.y
    const step = (distance: number) => Math.ceil(AUTO_SCROLL_MAX_STEP * (1 - Math.max(0, distance) / AUTO_SCROLL_EDGE))
    if (fromTop < AUTO_SCROLL_EDGE) runtime.postToCanvas({ type: 'scrollBy', dx: 0, dy: -step(fromTop) })
    else if (fromBottom < AUTO_SCROLL_EDGE) runtime.postToCanvas({ type: 'scrollBy', dx: 0, dy: step(fromBottom) })
  }, AUTO_SCROLL_TICK_MS)
  return () => window.clearInterval(timer)
}

type EditorProps = {
  config: BuilderClientConfig
  /** The document as the server loaded it. */
  meta: BuilderDocMeta
  /** The admin's icon graphic, for the top bar. */
  icon: ReactNode
  /** The locale to open a localized layout in. */
  locale?: string | null
}

/**
 * The full-screen editor. The document's live session is the source of truth for the layout: the
 * server loads the draft into it, and every edit goes through it (docs/architecture.md section 12).
 */
export function Editor({ config, meta, icon, locale }: EditorProps) {
  const { config: payloadConfig } = useConfig()
  const [runtime] = useState(() => createRuntime(config, payloadConfig.routes.api, meta, { locale }))
  const docId = meta.id
  useMultiplayer(runtime, { docId })
  // Ready once the first session arrived. A reconnect keeps the editor open.
  // A boolean: the editor (and dnd-kit's context with every draggable) must not render on each live update.
  const ready = useValueSelector(runtime.live, (live) => Boolean(live?.self))
  useFollow(runtime)
  useTemplateController(runtime)
  useEffect(() => runtime.assistant?.setDocument(config.collection, docId), [runtime, config.collection, docId])
  useEffect(() => () => runtime.assistant?.stop(), [runtime])
  // The hidden thumbnail iframe goes with the editor.
  useEffect(() => () => runtime.thumbnails.dispose(), [runtime])
  const stopAutoScroll = useRef<(() => void) | null>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => () => stopAutoScroll.current?.(), [])

  // Stored panel sizes, before the first paint of the client render.
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    applySizes(root, readSizes())
    // Spring easings for the smooth drag mode (CSS `linear()`, made from the spring settings).
    root.style.setProperty('--be-make-room', MAKE_ROOM_EASING)
    root.style.setProperty('--be-settle', SETTLE_EASING)
  }, [])
  // While a separator is dragged, the canvas iframe must not take the pointer.
  const lockPointer = useCallback((active: boolean) => runtime.pointerLock.set(active), [runtime])

  // Debugging aid in development only: browser automation reads the layout and the selection.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    Object.assign(window, { __builderEditor: runtime })
    return () => {
      Reflect.deleteProperty(window, '__builderEditor')
    }
  }, [runtime])

  useEffect(() => bindShortcuts(runtime, document, { forwarded: false }), [runtime])

  // Drop zones are not dnd-kit droppables. The measured rects decide the target, and the
  // result travels to the drag handlers as collision data.
  const collisionDetection: CollisionDetection = useCallback(
    ({ active, pointerCoordinates }) => {
      const data = active.data.current as DragData | undefined
      if (!pointerCoordinates || !data) return []
      const drop = dropAt(runtime, pointerCoordinates, data.source)
      return [{ id: COLLISION_ID, data: { ...drop, pointer: pointerCoordinates } }]
    },
    [runtime],
  )

  const onDragStart = ({ active, activatorEvent }: DragStartEvent) => {
    const data = active.data.current as DragData
    runtime.pointerLock.set(true)
    runtime.store.hover(null)
    runtime.insertSpot.set(null)
    runtime.drag.set({ source: data.source, label: data.label, icon: data.icon, zone: null, target: null, pointer: null })
    const initial = active.rect.current.initial
    const pointer = activatorEvent instanceof PointerEvent || activatorEvent instanceof MouseEvent ? { x: activatorEvent.clientX, y: activatorEvent.clientY } : null
    startSmoothDrag(runtime, data, {
      pointer,
      rect: initial ? { x: initial.left, y: initial.top, width: initial.width, height: initial.height } : null,
      fromOutline: String(active.id).startsWith('outline:'),
    })
    stopAutoScroll.current = startAutoScroll(runtime)
  }

  const onDragMove = ({ collisions }: DragMoveEvent) => {
    const current = runtime.drag.get()
    if (!current) return
    const data = collisions?.[0]?.data as Pick<DragState, 'zone' | 'target' | 'pointer'> | undefined
    runtime.drag.set({ ...current, zone: data?.zone ?? null, target: data?.target ?? null, pointer: data?.pointer ?? null })
    // The iframe ignores the pointer while dragging: others see the cursor from the drag position.
    const iframe = runtime.iframeRef.current
    const measurement = runtime.measurement.get()
    const local = iframe && data?.pointer ? toCanvasPoint(iframe, data.pointer) : null
    runtime.pointer.set(local && measurement ? cursorAt(runtime.store.getState().layout, measurement, local) : null)
  }

  const endDrag = () => {
    stopAutoScroll.current?.()
    stopAutoScroll.current = null
    runtime.drag.set(null)
    runtime.pointerLock.set(false)
  }

  const onDragEnd = ({ active }: DragEndEvent) => {
    // Use the drag store, not event.collisions: it is also refreshed when the canvas scrolls.
    const state = runtime.drag.get()
    const target = state?.target && !state.target.noop ? state.target : null
    const section = (active.data.current as DragData | undefined)?.blocks
    // One `move` or `insert` (a section: one insert per block). False when the edit is refused.
    const commit =
      state && target
        ? () => {
            const { source } = state
            if (section) return insertBlocks(runtime, section, target.to)
            if (source.kind === 'block') return runtime.store.apply({ type: 'move', id: source.id, to: target.to }, { select: source.id })
            const block = runtime.createBlock(source.blockType)
            if (!block || !runtime.store.apply({ type: 'insert', block, to: target.to }, { select: block.id, newContent: true })) return false
            runtime.focusRequest.set(block.id)
            return true
          }
        : null
    if (isSmoothDrag(runtime)) {
      endSmoothDrag(runtime, commit, endDrag)
      return
    }
    endDrag()
    commit?.()
  }

  const onDragCancel = () => {
    if (isSmoothDrag(runtime)) endSmoothDrag(runtime, null, endDrag)
    else endDrag()
  }

  return (
    <RuntimeContext value={runtime}>
      <DndContext
        // A stable id keeps dnd-kit's aria ids equal on server and client (no hydration mismatch).
        id={dndId}
        sensors={sensors}
        collisionDetection={collisionDetection}
        autoScroll={false}
        // Before the drag starts: otherwise the iframe swallows pointer moves and dnd-kit never sees them.
        onDragPending={() => runtime.pointerLock.set(true)}
        onDragAbort={() => runtime.pointerLock.set(false)}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div ref={rootRef} className="builder-editor">
          <TopBar icon={icon} />
          {ready ? (
            <div className="builder-editor__body">
              <aside className="builder-editor__left">
                <LeftPanel />
              </aside>
              <Splitter panel="left" side="before" onActive={lockPointer} />
              <Canvas />
              <Splitter panel="right" side="after" onActive={lockPointer} />
              <aside className="builder-editor__right">
                <Inspector />
              </aside>
            </div>
          ) : (
            <div className="builder-editor__body builder-editor__body--loading" aria-busy="true" aria-label="Loading the editor">
              <aside className="builder-editor__left">
                <ShimmerEffect height="30px" />
                <ShimmerEffect height="240px" />
              </aside>
              <div className="builder-editor__stage">
                <ShimmerEffect height="100%" />
              </div>
              <aside className="builder-editor__right">
                <ShimmerEffect height="34px" />
                <ShimmerEffect height="240px" />
              </aside>
            </div>
          )}
          <DragLayer />
          <SectionDialog />
        </div>
      </DndContext>
    </RuntimeContext>
  )
}
