'use client'

import type { Device } from './Canvas'
import { DesktopIcon, MobileIcon, RedoIcon, TabletIcon, UndoIcon } from './icons'
import { useRuntime } from './runtime'
import { useEditor } from './store'

const devices = [
  { id: 'desktop', label: 'Desktop', Icon: DesktopIcon },
  { id: 'tablet', label: 'Tablet', Icon: TabletIcon },
  { id: 'mobile', label: 'Mobile', Icon: MobileIcon },
] as const

export function Toolbar({ device, onDevice }: { device: Device; onDevice: (device: Device) => void }) {
  const { store } = useRuntime()
  const canUndo = useEditor(store, (s) => s.undoStack.length > 0)
  const canRedo = useEditor(store, (s) => s.redoStack.length > 0)
  const lastError = useEditor(store, (s) => s.lastError)

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
            onClick={() => onDevice(id)}
            title={label}
          >
            <Icon /> {label}
          </button>
        ))}
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
