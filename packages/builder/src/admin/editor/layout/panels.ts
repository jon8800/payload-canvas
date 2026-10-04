// Sizes of the editor's resizable panels: the left sidebar, the right sidebar and the Add library
// (the top part of the left sidebar). A size lives in a CSS variable on the editor root, so a
// drag changes one style property and React does not render. Sizes are kept in local storage.
// Without a stored size, the default comes from the stylesheet (layout.scss).

export type PanelId = 'left' | 'right' | 'library'

export type PanelSpec = {
  /** CSS variable on the editor root, in px. */
  variable: string
  /** Smallest and largest size, in px. */
  min: number
  max: number
  /** 'x' resizes a width, 'y' a height. */
  axis: 'x' | 'y'
  label: string
}

export const PANELS: Record<PanelId, PanelSpec> = {
  left: { variable: '--be-left-width', min: 200, max: 480, axis: 'x', label: 'Resize the left sidebar' },
  right: { variable: '--be-right-width', min: 280, max: 600, axis: 'x', label: 'Resize the right sidebar' },
  library: { variable: '--be-library-height', min: 96, max: 2000, axis: 'y', label: 'Resize the Add panel' },
}

/** Space the canvas keeps when a sidebar grows. */
export const MIN_STAGE_WIDTH = 360
/** Space the outline keeps when the Add panel grows. */
export const MIN_OUTLINE_HEIGHT = 120
/** Keyboard step, and the step with Shift. */
export const KEY_STEP = 16
export const KEY_STEP_LARGE = 64

const STORAGE_KEY = 'payload-builder:panels'

export type PanelSizes = Partial<Record<PanelId, number>>

export function readSizes(): PanelSizes {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!value || typeof value !== 'object') return {}
    const sizes: PanelSizes = {}
    for (const id of Object.keys(PANELS) as PanelId[]) {
      const px = (value as Record<string, unknown>)[id]
      if (typeof px === 'number' && Number.isFinite(px)) sizes[id] = clamp(px, PANELS[id].min, PANELS[id].max)
    }
    return sizes
  } catch {
    return {}
  }
}

/** Stores one size, or forgets it (`null`: back to the default). */
export function writeSize(id: PanelId, px: number | null) {
  try {
    const sizes = readSizes()
    if (px === null) delete sizes[id]
    else sizes[id] = Math.round(px)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes))
  } catch {
    // Storage blocked: the size lasts for this page only.
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Puts the stored sizes on the editor root. */
export function applySizes(root: HTMLElement, sizes: PanelSizes) {
  for (const id of Object.keys(PANELS) as PanelId[]) {
    const px = sizes[id]
    if (px === undefined) root.style.removeProperty(PANELS[id].variable)
    else root.style.setProperty(PANELS[id].variable, `${Math.round(px)}px`)
  }
}
