'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { deepestBlockAt } from '../../core'
import { unwrap, type CanvasToAdmin } from '../../protocol'
import { ancestors } from './actions'
import { BlockIcon, Icon } from './icons'
import { Overlay } from './Overlay'
import { computeDrop, useRuntime } from './runtime'
import { bindShortcuts } from './shortcuts'
import { useEditor } from './store'
import { breakpointAt, breakpointWidths, useStyleTokens, withFallback } from './styles/tokens'
import { useValue } from './valueStore'

/** Space between the stage edge and the frame. */
const STAGE_PADDING = 24
const NOTICE_MS = 1800

export function Canvas() {
  const runtime = useRuntime()
  const { iframeRef, pointerLock, config } = runtime
  const width = useEditor(runtime.store, (s) => s.canvasWidth)
  const locked = useValue(pointerLock)
  const error = useValue(runtime.canvasError)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })

  // Track the space the stage offers. The frame fills it (desktop) or zooms out to fit.
  useLayoutEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () =>
      setStage({
        width: Math.max(0, el.clientWidth - STAGE_PADDING * 2),
        height: Math.max(0, el.clientHeight - STAGE_PADDING * 2),
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const frameWidth = width ?? stage.width
  const zoom = frameWidth > stage.width && stage.width > 0 ? stage.width / frameWidth : 1
  useEffect(() => runtime.frame.set({ width: frameWidth, zoom }), [runtime, frameWidth, zoom])

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

  // Shortcuts the canvas script does not forward (copy, paste, duplicate, help). Same origin, so
  // the admin listens on the iframe document directly. Rebinds when the iframe reloads.
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    let unbind: (() => void) | null = null
    const bind = () => {
      unbind?.()
      const doc = iframe.contentDocument
      unbind = doc ? bindShortcuts(runtime, doc, { forwarded: true }) : null
    }
    if (iframe.contentDocument?.readyState === 'complete') bind()
    iframe.addEventListener('load', bind)
    return () => {
      iframe.removeEventListener('load', bind)
      unbind?.()
    }
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

  const frameStyle = {
    width: frameWidth || '100%',
    height: stage.height ? stage.height / zoom : '100%',
    transform: zoom === 1 ? undefined : `scale(${zoom})`,
    '--be-zoom': zoom,
    '--be-inv': 1 / zoom,
  } as CSSProperties

  return (
    <section className="builder-editor__stage">
      {error && (
        <output className="builder-editor__canvas-error">
          {error}
          <button type="button" onClick={() => runtime.canvasError.set(null)}>
            Dismiss
          </button>
        </output>
      )}
      <div ref={viewportRef} className="builder-editor__viewport" style={{ padding: STAGE_PADDING }}>
        <div
          className="builder-editor__frame-wrap"
          data-device={width === null ? 'fill' : 'fixed'}
          style={{ width: frameWidth * zoom || '100%', height: stage.height || '100%' }}
        >
          <div
            className="builder-editor__frame"
            style={frameStyle}
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
        </div>
        <Notice />
      </div>
      <StatusBar frameWidth={frameWidth} zoom={zoom} />
    </section>
  )
}

/** Short feedback at the bottom of the stage ("Copied Heading"). */
function Notice() {
  const runtime = useRuntime()
  const notice = useValue(runtime.notice)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => runtime.notice.set(null), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, runtime])
  if (!notice) return null
  return (
    <output key={notice.at} className="builder-editor__notice">
      <Icon name="check" size={14} /> {notice.text}
    </output>
  )
}

/** Selection path (clickable) on the left, width, breakpoint and zoom on the right. */
function StatusBar({ frameWidth, zoom }: { frameWidth: number; zoom: number }) {
  const runtime = useRuntime()
  const layout = useEditor(runtime.store, (s) => s.layout)
  const selectedId = useEditor(runtime.store, (s) => s.selectedId)
  const path = useMemo(() => (selectedId ? ancestors(layout, selectedId) : []), [layout, selectedId])
  const { tokens } = useStyleTokens(runtime.config.tokensEndpoint)
  const widths = useMemo(() => breakpointWidths(withFallback(tokens)), [tokens])
  const px = Math.round(frameWidth)

  return (
    <footer className="builder-editor__statusbar">
      <nav className="builder-editor__breadcrumb" aria-label="Selection path">
        {path.length === 0 ? (
          <span className="builder-editor__crumb-empty">
            <Icon name="cursor" size={14} /> Nothing selected
          </span>
        ) : (
          path.map((block, i) => (
            <span key={block.id} className="builder-editor__crumb-item">
              {i > 0 && <Icon name="chevronRight" size={12} className="builder-editor__crumb-sep" />}
              <button
                type="button"
                className="builder-editor__crumb"
                aria-current={i === path.length - 1 ? 'true' : undefined}
                onClick={() => runtime.store.select(block.id)}
                onPointerEnter={() => runtime.store.hover(block.id)}
                onPointerLeave={() => runtime.store.hover(null)}
              >
                <BlockIcon name={runtime.blockIcon(block.type)} size={14} />
                {runtime.blockLabel(block.type)}
              </button>
            </span>
          ))
        )}
      </nav>
      {px > 0 && (
        <span className="builder-editor__frame-info">
          <span>
            {px} px · {breakpointAt(widths, px)}
          </span>
          {zoom < 1 && <span className="builder-editor__zoom">{Math.round(zoom * 100)}%</span>}
        </span>
      )}
    </footer>
  )
}
