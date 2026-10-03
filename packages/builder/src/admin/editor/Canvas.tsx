'use client'

import { useEffect } from 'react'

import { deepestBlockAt } from '../../core'
import { unwrap, type CanvasToAdmin } from '../../protocol'
import { Overlay } from './Overlay'
import { computeDrop, useRuntime } from './runtime'
import { useEditor } from './store'
import { useValue } from './valueStore'

export function Canvas() {
  const runtime = useRuntime()
  const { iframeRef, pointerLock, config } = runtime
  const width = useEditor(runtime.store, (s) => s.canvasWidth)
  const locked = useValue(pointerLock)
  const error = useValue(runtime.canvasError)

  // Iframe -> admin messages.
  useEffect(() => {
    const { store, measurement, drag } = runtime
    const onMessage = (event: MessageEvent) => {
      const message = unwrap<CanvasToAdmin>(event, iframeRef.current?.contentWindow)
      if (!message) return
      switch (message.type) {
        case 'ready':
          sendAll()
          return
        case 'measure': {
          measurement.set(message.measurement)
          // Rects moved under a still pointer (scroll, resize): refresh the drop target.
          const current = drag.get()
          if (current?.pointer) drag.set({ ...current, ...computeDrop(runtime, current.pointer, current.source) })
          return
        }
        case 'pointer': {
          if (drag.get()) return
          if (message.kind === 'leave') {
            store.hover(null)
            return
          }
          const m = measurement.get()
          if (!m) return
          const hit = deepestBlockAt(store.getState().layout, m, message)
          if (message.kind === 'move') store.hover(hit)
          if (message.kind === 'click') store.select(hit)
          return
        }
        case 'key':
          runtime.runKey(message.key)
          return
        case 'error':
          runtime.canvasError.set(message.message)
      }
    }
    const sendAll = () => {
      const { layout, selectedId, hoveredId } = store.getState()
      runtime.postToCanvas({ type: 'init', init: runtime.canvasInit })
      runtime.postToCanvas({ type: 'layout', layout })
      runtime.postToCanvas({ type: 'selection', selectedId, hoveredId })
    }
    window.addEventListener('message', onMessage)
    // The iframe may already be listening (it loaded before this effect ran).
    sendAll()
    return () => window.removeEventListener('message', onMessage)
  }, [runtime, iframeRef])

  // Admin -> iframe: send the layout and the selection whenever they change.
  useEffect(() => {
    let last = runtime.store.getState()
    return runtime.store.subscribe(() => {
      const next = runtime.store.getState()
      if (next.layout !== last.layout) runtime.postToCanvas({ type: 'layout', layout: next.layout })
      if (next.selectedId !== last.selectedId || next.hoveredId !== last.hoveredId) {
        runtime.postToCanvas({ type: 'selection', selectedId: next.selectedId, hoveredId: next.hoveredId })
      }
      last = next
    })
  }, [runtime])

  return (
    <section className="builder-editor__stage">
      {error && (
        <output className="builder-editor__canvas-error">
          {error}{' '}
          <button type="button" onClick={() => runtime.canvasError.set(null)}>
            Dismiss
          </button>
        </output>
      )}
      <div
        className="builder-editor__frame"
        style={{ width: width === null ? '100%' : `${width}px` }}
        // While dragging, the iframe ignores the pointer, so forward the wheel to keep scrolling.
        onWheel={locked ? (e) => runtime.postToCanvas({ type: 'scrollBy', dx: e.deltaX, dy: e.deltaY }) : undefined}
      >
        {/* oxlint-disable-next-line react/iframe-missing-sandbox -- our own same-origin page; a sandbox needs allow-scripts + allow-same-origin, which cancels it */}
        <iframe
          ref={iframeRef}
          src={config.canvasPath}
          title="Canvas"
          className="builder-editor__iframe"
          style={{ pointerEvents: locked ? 'none' : undefined }}
        />
        <Overlay />
      </div>
    </section>
  )
}
