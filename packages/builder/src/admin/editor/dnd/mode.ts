'use client'

// Which drag and drop style the editor uses. The plugin option `editor.dragMode` sets the default;
// a user's choice in the canvas status bar overrides it in this browser (local storage). With
// `prefers-reduced-motion: reduce`, the editor always uses the drop indicator.

import type { DragMode } from '../../../core/types'
import type { Runtime } from '../runtime'
import { createValueStore, useValue, type ValueStore } from '../valueStore'

const STORAGE_KEY = 'payload-builder:drag-mode'

const isMode = (value: unknown): value is DragMode => value === 'indicator' || value === 'smooth'

function readChoice(): DragMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isMode(value) ? value : null
  } catch {
    return null
  }
}

const choices = new WeakMap<Runtime, ValueStore<DragMode | null>>()

/** The user's own choice, or null to follow the plugin's default. */
export function dragModeChoice(runtime: Runtime): ValueStore<DragMode | null> {
  let store = choices.get(runtime)
  if (!store) {
    store = createValueStore<DragMode | null>(typeof window === 'undefined' ? null : readChoice())
    const own = store
    own.subscribe(() => {
      try {
        const value = own.get()
        if (value) localStorage.setItem(STORAGE_KEY, value)
        else localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Storage blocked: the choice lasts for this session only.
      }
    })
    choices.set(runtime, store)
  }
  return store
}

/** The plugin's default drag mode. */
export function defaultDragMode(runtime: Runtime): DragMode {
  return runtime.config.editor?.dragMode ?? 'indicator'
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The mode a drag starting now uses. */
export function dragMode(runtime: Runtime): DragMode {
  if (prefersReducedMotion()) return 'indicator'
  return dragModeChoice(runtime).get() ?? defaultDragMode(runtime)
}

/** The chosen mode (the user's choice or the default), for the setting's UI. */
export function useDragModeSetting(runtime: Runtime): DragMode {
  return useValue(dragModeChoice(runtime)) ?? defaultDragMode(runtime)
}
