'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { deepestBlockAt } from '../../core'
import { unwrap, type CanvasToAdmin } from '../../protocol'
import { ancestors } from './actions'
import { dragModeChoice, prefersReducedMotion, useDragModeSetting } from './dnd/mode'
import { dropAt } from './dnd/smooth'
import { BlockIcon, Icon } from './icons'
import { applyInlineChange, applyInlineJoin, applyInlineSplit, boundHint, inlineEditing, stopInlineEditing } from './inline'
import { blockName } from './names'
import { MenuButton } from './menu/Menu'
import { useCanvasMenus } from './menu/useCanvasMenus'
import { cursorAt } from './live'
import { FollowFrame } from './live/PresenceUI'
import { EDGE_BAND, insertSpotAt, sameSpot } from './insert/spots'
import { Overlay } from './Overlay'
import { useRuntime, type Runtime } from './runtime'
import { bindShortcuts } from './shortcuts'
import { useEditor } from './store'
import { postContext, templateContext } from './templates/state'
import { breakpointAt, breakpointWidths, useStyleTokens, withFallback } from './styles/tokens'
import { sameItems, useValue } from './valueStore'

const NO_PATH: never[] = []

/** Space between the stage edge and the frame. */
const STAGE_PADDING = 24
const NOTICE_MS = 1800
const WARNING_MS = 5000
/** Times for the canvas to render a new block before it scrolls to it. */
const REVEAL_DELAYS_MS = [120, 600]
/** The "+" stays this long after the pointer leaves the canvas, so the pointer can reach it. */
const SPOT_LINGER_MS = 160
/** Width of a container's edge band for the "+", in screen pixels. */
const SPOT_BAND_PX = 10

export function Canvas() {
  const runtime = useRuntime()
  const { iframeRef, pointerLock, config } = runtime
  useCanvasMenus(runtime)
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

  // Fluid (no fixed width) fills the stage at 100 %, so the canvas shows the breakpoint of the free
  // space. A fixed zoom below 100 % makes the fluid frame wider, so it still fills the stage.
  // A fixed width wider than the stage zooms out to fit.
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit')
  const fluid = width === null
  const frameWidth = fluid ? Math.round(stage.width / (zoomMode === 'fit' ? 1 : zoomMode)) : width
  const fit = !fluid && frameWidth > stage.width && stage.width > 0 ? stage.width / frameWidth : 1
  const zoom = zoomMode === 'fit' ? fit : zoomMode
  useEffect(() => runtime.frame.set({ width: frameWidth, zoom }), [runtime, frameWidth, zoom])

  // Iframe -> admin messages.
  useEffect(() => {
    const { store, measurement, drag } = runtime
    const inline = inlineEditing(runtime)
    let spotTimer = 0
    const setSpot = (spot: ReturnType<typeof insertSpotAt>) => {
      window.clearTimeout(spotTimer)
      if (!sameSpot(spot, runtime.insertSpot.get())) runtime.insertSpot.set(spot)
    }
    const onMessage = (event: MessageEvent) => {
      const message = unwrap<CanvasToAdmin>(event, iframeRef.current?.contentWindow)
      if (!message) return
      switch (message.type) {
        case 'ready':
          // A reloaded canvas has no editing session.
          inline.set(null)
          sendAll()
          return
        case 'measure': {
          measurement.set(message.measurement)
          // Rects moved under a still pointer (scroll, resize): refresh the drop target.
          const current = drag.get()
          if (current?.pointer) drag.set({ ...current, ...dropAt(runtime, current.pointer, current.source) })
          return
        }
        case 'pointer': {
          // Others see this pointer, relative to the block under it.
          if (message.kind === 'leave') runtime.pointer.set(null)
          else {
            const m = measurement.get()
            if (m) runtime.pointer.set(cursorAt(store.getState().layout, m, message))
          }
          if (drag.get()) {
            setSpot(null)
            return
          }
          if (message.kind === 'leave') {
            store.hover(null)
            window.clearTimeout(spotTimer)
            spotTimer = window.setTimeout(() => runtime.insertSpot.set(null), SPOT_LINGER_MS)
            return
          }
          const m = measurement.get()
          if (!m) return
          const { layout } = store.getState()
          const hit = deepestBlockAt(layout, m, message)
          if (message.kind === 'move') {
            store.hover(hit)
            const band = Math.max(EDGE_BAND, SPOT_BAND_PX / (runtime.frame.get().zoom || 1))
            setSpot(inline.get() ? null : insertSpotAt(layout, runtime.config.blocks, m, message, { band }))
          }
          if (message.kind === 'click') store.select(hit)
          return
        }
        case 'key':
          // Escape in the canvas during a drag cancels the drag: dnd-kit listens on the admin window.
          if (message.key === 'escape' && drag.get()) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
            return
          }
          runtime.runKey(message.key)
          return
        case 'error':
          runtime.canvasError.set(message.message)
          return
        case 'inlineStart':
          store.select(message.id)
          inline.set({ session: message.session, id: message.id, path: message.path, kind: message.kind, format: null, linkRequest: 0 })
          store.hover(null)
          return
        case 'inlineChange':
          applyInlineChange(runtime, message)
          return
        case 'inlineEnd':
          if (inline.get()?.session === message.session) inline.set(null)
          return
        case 'inlineSplit':
          applyInlineSplit(runtime, message)
          return
        case 'inlineJoin':
          applyInlineJoin(runtime, message)
          return
        case 'inlineFormat': {
          const current = inline.get()
          if (current?.session === message.session) inline.set({ ...current, format: message.format })
          return
        }
        case 'inlineLink': {
          const current = inline.get()
          if (current?.session === message.session) inline.set({ ...current, linkRequest: Date.now() })
          return
        }
        case 'inlineRefused':
          if (message.reason === 'bound') runtime.notify(boundHint(message.field ?? ''))
          else runtime.warn('This rich text has content the canvas cannot edit. Edit it in the inspector.')
      }
    }
    // A press anywhere in the admin, outside the rich text toolbar, ends inline editing.
    const onPointerDown = (e: PointerEvent) => {
      if (!inline.get()) return
      if (e.target instanceof Element && e.target.closest('[data-inline-toolbar]')) return
      stopInlineEditing(runtime)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    const sendAll = () => {
      // The canvas renders the layout in the editor's locale (`view`).
      const { view, selectedId, hoveredId } = store.getState()
      runtime.postToCanvas({ type: 'init', init: runtime.canvasInit })
      // Before the layout, so a template's first render already has its document.
      if (runtime.template.get().isTemplate) postContext(iframeRef.current, templateContext(runtime.template.get()))
      runtime.postToCanvas({ type: 'layout', layout: view })
      runtime.postToCanvas({ type: 'selection', selectedId, hoveredId })
    }
    window.addEventListener('message', onMessage)
    // The iframe may already be listening (it loaded before this effect ran).
    sendAll()
    return () => {
      window.clearTimeout(spotTimer)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
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

  // Admin -> iframe: the template's sample document, whenever it changes.
  useEffect(() => {
    if (!runtime.template.get().isTemplate) return
    let last = templateContext(runtime.template.get())
    return runtime.template.subscribe(() => {
      const next = templateContext(runtime.template.get())
      if (next?.doc === last?.doc && next?.collection === last?.collection) return
      last = next
      postContext(iframeRef.current, next)
    })
  }, [runtime, iframeRef])

  // Admin -> iframe: send the layout and the selection whenever they change.
  useEffect(() => {
    let last = runtime.store.getState()
    let reveal: number[] = []
    const unsubscribe = runtime.store.subscribe(() => {
      const next = runtime.store.getState()
      if (next.view !== last.view) {
        runtime.postToCanvas({ type: 'layout', layout: next.view })
        // The "+" belongs to the old layout. The next pointer move places it again.
        runtime.insertSpot.set(null)
      }
      // Another block selected (or the edited block deleted): inline editing ends.
      const editing = inlineEditing(runtime).get()
      if (editing && next.selectedId !== editing.id && next.selectedId !== last.selectedId) stopInlineEditing(runtime)
      if (next.selectedId !== last.selectedId || next.hoveredId !== last.hoveredId) {
        runtime.postToCanvas({ type: 'selection', selectedId: next.selectedId, hoveredId: next.hoveredId })
      }
      // A new block selected in the same edit (insert, paste, duplicate) is not on the canvas yet
      // when the selection arrives. Ask again once it has rendered, so it scrolls into view.
      const id = next.selectedId
      if (id && id !== last.selectedId && next.layout !== last.layout) {
        for (const timer of reveal) window.clearTimeout(timer)
        // Twice: a large section may need its styles compiled before it has its full height.
        reveal = REVEAL_DELAYS_MS.map((delay) => window.setTimeout(() => runtime.postToCanvas({ type: 'scrollIntoView', id }), delay))
      }
      last = next
    })
    return () => {
      for (const timer of reveal) window.clearTimeout(timer)
      unsubscribe()
    }
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
          data-device={fluid ? 'fluid' : 'fixed'}
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
        <FollowFrame />
        <Notice />
      </div>
      <StatusBar frameWidth={frameWidth} zoom={zoom} fit={fit} zoomMode={zoomMode} onZoom={setZoomMode} />
    </section>
  )
}

/** "fit" zooms the frame out until it fits the stage. A number is a fixed zoom; the stage scrolls sideways. */
type ZoomMode = 'fit' | number
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1]

/** Zoom out, the current zoom (click to fit), zoom in. */
function ZoomControl({ zoom, fit, mode, onZoom }: { zoom: number; fit: number; mode: ZoomMode; onZoom: (mode: ZoomMode) => void }) {
  const percent = Math.round(zoom * 100)
  const smaller = ZOOM_STEPS.toReversed().find((step) => step < zoom - 0.005)
  const larger = ZOOM_STEPS.find((step) => step > zoom + 0.005)
  // A fixed zoom that equals the fit zoom goes back to "fit", so the frame follows the stage again.
  const pick = (step: number | undefined) => step !== undefined && onZoom(Math.abs(step - fit) < 0.005 ? 'fit' : step)
  return (
    <span className="builder-editor__zoom-control">
      <button
        type="button"
        className="builder-editor__icon-button builder-editor__icon-button--small"
        aria-label="Zoom out"
        data-tooltip="Zoom out"
        disabled={smaller === undefined}
        onClick={() => pick(smaller)}
      >
        <Icon name="minus" size={14} />
      </button>
      <button
        type="button"
        className="builder-editor__zoom"
        aria-pressed={mode === 'fit'}
        aria-label={`Zoom ${percent}%. ${mode === 'fit' ? 'Fits the stage.' : 'Click to fit the stage.'}`}
        data-tooltip={mode === 'fit' ? 'Zoom fits the stage' : 'Fit to the stage'}
        onClick={() => onZoom('fit')}
      >
        {mode === 'fit' ? `Fit · ${percent}%` : `${percent}%`}
      </button>
      <button
        type="button"
        className="builder-editor__icon-button builder-editor__icon-button--small"
        aria-label="Zoom in"
        data-tooltip="Zoom in"
        disabled={larger === undefined}
        onClick={() => pick(larger)}
      >
        <Icon name="plus" size={14} />
      </button>
    </span>
  )
}

/** Short feedback at the bottom of the stage ("Copied Heading"), or a warning about a conflict. */
function Notice() {
  const runtime = useRuntime()
  const notice = useValue(runtime.notice)
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => runtime.notice.set(null), notice.tone === 'warning' ? WARNING_MS : NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice, runtime])
  if (!notice) return null
  const warning = notice.tone === 'warning'
  return (
    <output key={notice.at} className={`builder-editor__notice${warning ? ' builder-editor__notice--warning' : ''}`}>
      <Icon name={warning ? 'warning' : 'check'} size={14} /> {notice.text}
    </output>
  )
}

/** Selection path (clickable) on the left, width, breakpoint and zoom on the right. */
function StatusBar({
  frameWidth,
  zoom,
  fit,
  zoomMode,
  onZoom,
}: {
  frameWidth: number
  zoom: number
  fit: number
  zoomMode: ZoomMode
  onZoom: (mode: ZoomMode) => void
}) {
  const runtime = useRuntime()
  // Renders when a block on the path changes, not on every edit elsewhere on the page.
  const path = useEditor(runtime.store, (s) => (s.selectedId ? ancestors(s.layout, s.selectedId) : NO_PATH), sameItems)
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
                {blockName(block, runtime.blockLabel(block.type))}
              </button>
            </span>
          ))
        )}
      </nav>
      {px > 0 && (
        <span className="builder-editor__frame-info">
          <span data-tooltip="Canvas width and the breakpoint it shows">
            {px} px · {breakpointAt(widths, px)}
          </span>
          <ZoomControl zoom={zoom} fit={fit} mode={zoomMode} onZoom={onZoom} />
          <DragModeMenu runtime={runtime} />
        </span>
      )}
    </footer>
  )
}

/** Drag and drop style: the drop indicator or the smooth mode. The choice stays in this browser. */
function DragModeMenu({ runtime }: { runtime: Runtime }) {
  const mode = useDragModeSetting(runtime)
  const reduced = prefersReducedMotion()
  const choose = (next: 'indicator' | 'smooth') => dragModeChoice(runtime).set(next)
  return (
    <MenuButton
      className="builder-editor__icon-button builder-editor__icon-button--small"
      triggerLabel="Drag and drop style"
      tooltip="Drag and drop style"
      label="Drag and drop style"
      side="top"
      align="end"
      footer={reduced ? 'Your system asks for less motion, so dragging shows the drop line.' : undefined}
      items={() => [
        { label: 'Show a drop line', icon: 'drag', checked: mode === 'indicator', run: () => choose('indicator') },
        { label: 'Move blocks out of the way', icon: 'layers', checked: mode === 'smooth', disabled: reduced, run: () => choose('smooth') },
      ]}
    >
      <Icon name="drag" size={14} />
    </MenuButton>
  )
}
