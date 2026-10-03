'use client'

import { useMemo } from 'react'

import { DesktopIcon, MobileIcon, RedoIcon, TabletIcon, UndoIcon } from './icons'
import { useRuntime } from './runtime'
import { useEditor } from './store'
import { breakpointWidths, useStyleTokens, withFallback } from './styles/tokens'
import { deviceForWidth, selectDevice } from './styles/viewport'

const devices = [
  { id: 'desktop', label: 'Desktop', Icon: DesktopIcon },
  { id: 'tablet', label: 'Tablet', Icon: TabletIcon },
  { id: 'mobile', label: 'Mobile', Icon: MobileIcon },
] as const

/** Width the canvas gets on "desktop": the stage minus its padding. */
function stageWidth(iframe: HTMLIFrameElement | null): number {
  const stage = iframe?.closest<HTMLElement>('.builder-editor__stage')
  if (!stage) return window.innerWidth
  const style = getComputedStyle(stage)
  return stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
}

export function Toolbar() {
  const { store, config, iframeRef } = useRuntime()
  const canUndo = useEditor(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditor(store, (s) => s.redoStack.length > 0)
  const lastError = useEditor(store, (s) => s.lastError)
  const width = useEditor(store, (s) => s.canvasWidth)
  // Loads the tokens early (shared cache with the Styles panel) for the breakpoint widths.
  const { tokens } = useStyleTokens(config.tokensEndpoint)
  const widths = useMemo(() => breakpointWidths(withFallback(tokens)), [tokens])
  const device = deviceForWidth(width)

  return (
    <div className="builder-editor__toolbar">
      <div className="builder-editor__group">
        <button type="button" className="builder-editor__tool" disabled={!canUndo} onClick={store.undo} title="Undo (Ctrl+Z)">
          <UndoIcon /> Undo
        </button>
        <button
          type="button"
          className="builder-editor__tool"
          disabled={!canRedo}
          onClick={store.redo}
          title="Redo (Ctrl+Shift+Z)"
        >
          <RedoIcon /> Redo
        </button>
      </div>
      <div className="builder-editor__group">
        {devices.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className="builder-editor__tool"
            aria-pressed={device === id}
            onClick={() => selectDevice(store, widths, id, stageWidth(iframeRef.current))}
            title={label}
          >
            <Icon /> {label}
          </button>
        ))}
        {width !== null && <span className="builder-editor__width">{width}px</span>}
      </div>
      {lastError && (
        <output className="builder-editor__error">
          {lastError}{' '}
          <button type="button" onClick={store.clearError}>
            Dismiss
          </button>
        </output>
      )}
    </div>
  )
}
