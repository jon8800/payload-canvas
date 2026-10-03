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
import { ShimmerEffect, useConfig, useDocumentInfo } from '@payloadcms/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import type { BuilderClientConfig } from '../../core/types'
import { insertBlocks } from './actions'
import { Canvas } from './Canvas'
import { DragLayer } from './DragLayer'
import { Inspector } from './Inspector'
import { Library } from './Library'
import { Outline } from './Outline'
import { computeDrop, createRuntime, RuntimeContext, type DragData, type DragState, type Runtime } from './runtime'
import { bindShortcuts } from './shortcuts'
import { Toolbar } from './Toolbar'
import { useLayoutFieldSync } from './useLayoutFieldSync'
import { useLiveOperations } from './live'
import { useTemplateController } from './templates/useTemplate'

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

export function Editor({ config, path }: { config: BuilderClientConfig; path: string }) {
  const { config: payloadConfig } = useConfig()
  const [runtime] = useState(() => createRuntime(config, payloadConfig.routes.api))
  const { ready } = useLayoutFieldSync(runtime.store, path)
  const { id: docId } = useDocumentInfo()
  const live = useLiveOperations({ config, docId, store: runtime.store, enabled: ready, highlightMs: 2500 })
  useEffect(() => runtime.live.set(live), [runtime, live])
  useTemplateController(runtime)
  const stopAutoScroll = useRef<(() => void) | null>(null)
  const dndId = useId()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Fill the viewport below Payload's header, tabs and document controls, whatever their height.
  const fitToViewport = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.height = `${Math.max(520, window.innerHeight - top)}px`
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [])

  useEffect(() => () => stopAutoScroll.current?.(), [])

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
      const drop = computeDrop(runtime, pointerCoordinates, data.source)
      return [{ id: COLLISION_ID, data: { ...drop, pointer: pointerCoordinates } }]
    },
    [runtime],
  )

  const onDragStart = ({ active }: DragStartEvent) => {
    const data = active.data.current as DragData
    runtime.pointerLock.set(true)
    runtime.store.hover(null)
    runtime.drag.set({ source: data.source, label: data.label, icon: data.icon, zone: null, target: null, pointer: null })
    stopAutoScroll.current = startAutoScroll(runtime)
  }

  const onDragMove = ({ collisions }: DragMoveEvent) => {
    const current = runtime.drag.get()
    if (!current) return
    const data = collisions?.[0]?.data as Pick<DragState, 'zone' | 'target' | 'pointer'> | undefined
    runtime.drag.set({ ...current, zone: data?.zone ?? null, target: data?.target ?? null, pointer: data?.pointer ?? null })
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
    endDrag()
    if (!state?.target || state.target.noop) return
    const { source, target } = state
    const section = (active.data.current as DragData | undefined)?.blocks
    if (section) {
      insertBlocks(runtime, section, target.to)
      return
    }
    if (source.kind === 'block') {
      runtime.store.apply({ type: 'move', id: source.id, to: target.to }, { select: source.id })
      return
    }
    const block = runtime.createBlock(source.blockType)
    if (block) runtime.store.apply({ type: 'insert', block, to: target.to }, { select: block.id })
  }

  if (!ready) return <ShimmerEffect height="480px" />

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
        onDragCancel={endDrag}
      >
        <div ref={fitToViewport} className="builder-editor">
          <Toolbar />
          <div className="builder-editor__body">
            <aside className="builder-editor__left">
              <Library />
              <Outline />
            </aside>
            <Canvas />
            <aside className="builder-editor__right">
              <Inspector />
            </aside>
          </div>
          <DragLayer />
        </div>
      </DndContext>
    </RuntimeContext>
  )
}
