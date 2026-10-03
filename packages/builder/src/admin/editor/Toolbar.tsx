'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { Icon, type IconName } from './icons'
import { useRuntime } from './runtime'
import { shortcutList } from './shortcuts'
import { useEditor } from './store'
import { breakpointAt, breakpointWidths, useStyleTokens, withFallback } from './styles/tokens'
import { DEVICE_WIDTHS, deviceForWidth, MAX_CANVAS_WIDTH, MIN_CANVAS_WIDTH, type Device } from './styles/viewport'
import { useValue } from './valueStore'

const devices: { id: Device; label: string; icon: IconName }[] = [
  { id: 'desktop', label: 'Desktop · fill the stage', icon: 'desktop' },
  { id: 'tablet', label: 'Tablet · 768 px', icon: 'tablet' },
  { id: 'mobile', label: 'Mobile · 390 px', icon: 'mobile' },
]

export function Toolbar() {
  const runtime = useRuntime()
  const { store, config } = runtime
  const canUndo = useEditor(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditor(store, (s) => s.redoStack.length > 0)
  const lastError = useEditor(store, (s) => s.lastError)
  const width = useEditor(store, (s) => s.canvasWidth)
  const frame = useValue(runtime.frame)
  // Loads the tokens early (shared cache with the Styles panel) for the breakpoint widths.
  const { tokens } = useStyleTokens(config.tokensEndpoint)
  const widths = useMemo(() => breakpointWidths(withFallback(tokens)), [tokens])
  const device = deviceForWidth(width)
  const shownWidth = Math.round(width ?? frame.width)

  return (
    <div className="builder-editor__toolbar">
      <div className="builder-editor__group">
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

      <div className="builder-editor__toolbar-center">
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
        <WidthInput key={shownWidth} value={shownWidth} onCommit={(px) => store.setCanvasWidth(px)} />
        <span className="builder-editor__bp-badge" title="Largest breakpoint active at this width">
          {shownWidth > 0 ? breakpointAt(widths, shownWidth) : '–'}
        </span>
      </div>

      <div className="builder-editor__group builder-editor__group--end">
        {lastError && (
          <output className="builder-editor__error">
            {lastError}
            <button type="button" className="builder-editor__icon-button builder-editor__icon-button--small" aria-label="Dismiss" onClick={store.clearError}>
              <Icon name="close" size={14} />
            </button>
          </output>
        )}
        <LivePresence />
        <ShortcutHelp />
      </div>
    </div>
  )
}

/** Custom canvas width. Enter or blur applies it; Escape reverts. */
function WidthInput({ value, onCommit }: { value: number; onCommit: (px: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const commit = () => {
    const px = Math.round(Number(draft))
    if (!Number.isFinite(px) || px <= 0 || px === value) return setDraft(String(value))
    onCommit(Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, px)))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      setDraft(String(value))
      e.currentTarget.blur()
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const step = (e.shiftKey ? 100 : 10) * (e.key === 'ArrowUp' ? 1 : -1)
      onCommit(Math.min(MAX_CANVAS_WIDTH, Math.max(MIN_CANVAS_WIDTH, value + step)))
    }
  }
  return (
    <label className="builder-editor__width-input" data-tooltip="Custom width (↑/↓ to step)">
      <input
        aria-label="Canvas width in pixels"
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
  const ref = useRef<HTMLDivElement>(null)

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
            {shortcutList().map(({ keys, label }) => (
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

/** Who else has this document open, and the last change an AI agent or another person made. */
function LivePresence() {
  const runtime = useRuntime()
  const live = useValue(runtime.live)
  if (!live) return null
  const others = live.members.filter((m) => !m.self)
  const status = live.status === 'open' ? 'Live' : live.status === 'connecting' ? 'Connecting…' : 'Reconnecting…'
  const recent = live.lastChange && live.recentlyChanged.size > 0 ? live.lastChange.actor : null
  return (
    <div className="builder-editor__live" data-status={live.status}>
      {recent && (
        <span className="builder-editor__live-activity">
          <Icon name={recent.type === 'ai' ? 'sparkle' : 'user'} size={12} />
          {recent.label} is editing
        </span>
      )}
      {live.lastError && (
        <span className="builder-editor__live-error" title={live.lastError}>
          Sync issue
        </span>
      )}
      <span className="builder-editor__live-members">
        {others.slice(0, 4).map((m) => (
          <span
            key={`${m.type}:${m.name}`}
            className={`builder-editor__avatar builder-editor__avatar--${m.type}`}
            data-tooltip={`${m.name}${m.type === 'ai' ? ' (AI)' : ''} has this page open`}
          >
            {m.type === 'ai' ? <Icon name="sparkle" size={11} /> : initials(m.name)}
          </span>
        ))}
        {others.length > 4 && <span className="builder-editor__avatar">+{others.length - 4}</span>}
      </span>
      <span className="builder-editor__live-dot" data-tooltip={`${status} · changes from AI agents and other editors appear here instantly`} />
    </div>
  )
}

function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase()
}
