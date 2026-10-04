'use client'

// The full-screen builder's one top bar. Left: back, the admin home, the document title and its
// status. Center: undo, redo and the canvas width. Right: who is here, the save state, preview,
// page settings, help and Publish. The AI assistant opens from the inspector tab (or Ctrl+I).

import { Link, useConfig } from '@payloadcms/ui'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

import { Icon, type IconName } from '../icons'
import { Presence } from '../live/PresenceUI'
import { useRuntime } from '../runtime'
import { shortcutList } from '../shortcuts'
import { useEditor } from '../store'
import { TemplateControl } from '../templates/SamplePicker'
import { breakpointAt, breakpointWidths, useStyleTokens, withFallback } from '../styles/tokens'
import { DESKTOP_WIDTH, DEVICE_WIDTHS, deviceForWidth, MAX_CANVAS_WIDTH, MIN_CANVAS_WIDTH, type Device } from '../styles/viewport'
import { useValue } from '../valueStore'
import { DocumentTitle, documentTitle, StatusChip } from './DocumentTitle'
import { PageSettings, PreviewButton, PublishButton, SaveState } from './DocumentActions'
import { ScreenDrawer } from './screens/ScreenDrawer'
import { useDismiss } from './useDismiss'
import './topbar.scss'

const devices: { id: Device; label: string; icon: IconName }[] = [
  { id: 'fluid', label: 'Fluid · fills the free space', icon: 'width' },
  { id: 'desktop', label: `Desktop · ${DESKTOP_WIDTH} px`, icon: 'desktop' },
  { id: 'tablet', label: 'Tablet · 768 px', icon: 'tablet' },
  { id: 'mobile', label: 'Mobile · 390 px', icon: 'mobile' },
]

/** `icon` is the admin's icon graphic (Payload's, or the app's `admin.components.graphics.Icon`). */
export function TopBar({ icon }: { icon: ReactNode }) {
  const runtime = useRuntime()
  const { meta } = runtime.doc
  const doc = useValue(meta)
  const { collection, id } = doc
  const title = documentTitle(doc) || 'Untitled'
  const {
    config: { routes },
  } = useConfig()
  const admin = routes.admin === '/' ? '' : routes.admin
  // Loads the tokens early (shared cache with the Styles panel) for the breakpoint widths.
  const { tokens } = useStyleTokens(runtime.config.tokensEndpoint)
  const widths = useMemo(() => breakpointWidths(withFallback(tokens)), [tokens])

  // The browser tab shows the document. Next sets the view's static title after hydration and on
  // refreshes, so the title is applied again whenever the head changes.
  useEffect(() => {
    const wanted = `${title} · Builder`
    const apply = () => {
      if (document.title !== wanted) document.title = wanted
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [title])

  return (
    <header className="builder-bar">
      <div className="builder-bar__start">
        <Link
          href={`${admin}/collections/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`}
          className="builder-editor__icon-button"
          aria-label="Back to the edit view"
          data-tooltip="Back to the edit view"
        >
          <Icon name="back" />
        </Link>
        <Link href={admin || '/'} className="builder-bar__home" aria-label="Admin home" data-tooltip="Admin home">
          {icon}
        </Link>
        <DocumentTitle />
        <StatusChip />
      </div>

      <div className="builder-bar__center">
        <HistoryButtons />
        <span className="builder-bar__divider" />
        <CanvasWidth widths={widths} />
        <TemplateControl />
      </div>

      <div className="builder-bar__end">
        <EditorError />
        <Presence widths={widths} />
        <SaveState />
        <span className="builder-bar__divider" />
        <PreviewButton />
        <PageSettings />
        <ShortcutHelp />
        <PublishButton />
      </div>
      <ScreenDrawer />
    </header>
  )
}

function HistoryButtons() {
  const { store } = useRuntime()
  const canUndo = useEditor(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditor(store, (s) => s.redoStack.length > 0)
  return (
    <div className="builder-bar__group">
      <button
        type="button"
        className="builder-editor__icon-button"
        disabled={!canUndo}
        onClick={store.undo}
        aria-label="Undo"
        data-tooltip="Undo · Ctrl+Z"
      >
        <Icon name="undo" />
      </button>
      <button
        type="button"
        className="builder-editor__icon-button"
        disabled={!canRedo}
        onClick={store.redo}
        aria-label="Redo"
        data-tooltip="Redo · Ctrl+Shift+Z"
      >
        <Icon name="redo" />
      </button>
    </div>
  )
}

/** Device sizes, a custom width and the breakpoint active at that width. */
function CanvasWidth({ widths }: { widths: Parameters<typeof breakpointAt>[0] }) {
  const runtime = useRuntime()
  const { store } = runtime
  const width = useEditor(store, (s) => s.canvasWidth)
  const frame = useValue(runtime.frame)
  const device = deviceForWidth(width)
  const shownWidth = Math.round(width ?? frame.width)
  return (
    <div className="builder-bar__group">
      <fieldset className="builder-editor__segmented" aria-label="Canvas width">
        {devices.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className="builder-editor__segment"
            aria-pressed={device === id}
            aria-label={label}
            data-tooltip={label}
            onClick={() => store.setCanvasWidth(DEVICE_WIDTHS[id])}
          >
            <Icon name={icon} />
          </button>
        ))}
      </fieldset>
      <WidthInput key={shownWidth} value={shownWidth} onCommit={(px) => store.setCanvasWidth(px)} onRefuse={runtime.warn} />
      <span
        className="builder-editor__bp-badge"
        data-tooltip="The breakpoint the canvas shows at this width"
        aria-label={`Breakpoint ${shownWidth > 0 ? breakpointAt(widths, shownWidth) : 'unknown'}`}
      >
        {shownWidth > 0 ? breakpointAt(widths, shownWidth) : '–'}
      </span>
    </div>
  )
}

/** The last operation the editor refused. */
function EditorError() {
  const { store } = useRuntime()
  const lastError = useEditor(store, (s) => s.lastError)
  if (!lastError) return null
  return (
    <output className="builder-editor__error">
      {lastError}
      <button type="button" className="builder-editor__icon-button builder-editor__icon-button--small" aria-label="Dismiss" onClick={store.clearError}>
        <Icon name="close" size={14} />
      </button>
    </output>
  )
}

const clamp = (px: number) => Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, px))

/** Custom canvas width. Enter or blur applies it; Escape reverts. Out-of-range values are clamped, with a notice. */
function WidthInput({ value, onCommit, onRefuse }: { value: number; onCommit: (px: number) => void; onRefuse: (text: string) => void }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const px = Math.round(Number(draft))
    if (!draft.trim() || !Number.isFinite(px) || px === value) return setDraft(String(value))
    const next = clamp(px)
    if (next !== px) onRefuse(`The canvas width must be ${MIN_CANVAS_WIDTH}–${MAX_CANVAS_WIDTH} px. It is now ${next} px.`)
    if (next === value) return setDraft(String(value))
    onCommit(next)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      // Escape only reverts the width; it must not clear the block selection.
      e.stopPropagation()
      setDraft(String(value))
      e.currentTarget.blur()
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowUp' ? 1 : -1)
      onCommit(clamp(value + step))
    }
  }
  return (
    <label className="builder-editor__width-input" data-tooltip={`Custom width, ${MIN_CANVAS_WIDTH}–${MAX_CANVAS_WIDTH} px (↑/↓ to step)`}>
      <input
        aria-label={`Canvas width in pixels, ${MIN_CANVAS_WIDTH} to ${MAX_CANVAS_WIDTH}`}
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ''))}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <span>px</span>
    </label>
  )
}

function ShortcutHelp() {
  const runtime = useRuntime()
  const open = useValue(runtime.help)
  const { drafts } = useValue(runtime.doc.meta)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => runtime.help.set(false)
  useDismiss(open, close, [ref])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) runtime.help.set(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, runtime])

  return (
    <div ref={ref} className="builder-editor__help">
      <button
        type="button"
        className="builder-editor__icon-button"
        aria-label="Keyboard shortcuts"
        aria-expanded={open}
        data-tooltip="Keyboard shortcuts · ?"
        onClick={() => runtime.help.set(!open)}
      >
        <Icon name="help" />
      </button>
      {open && (
        <section className="builder-editor__help-panel" aria-label="Keyboard shortcuts">
          <p className="builder-editor__help-title">Keyboard shortcuts</p>
          <dl>
            {shortcutList({ ai: Boolean(runtime.config.ai), publish: drafts }).map(({ keys, label }) => (
              <div key={label} className="builder-editor__help-row">
                <dt>{label}</dt>
                <dd>
                  {keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
