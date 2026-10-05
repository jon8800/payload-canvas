// The left sidebar's tabs: Layers (the outline tree), Blocks and Sections. The last tab the user
// picked is kept in local storage. Alt+1, Alt+2 and Alt+3 open them (shortcuts.ts).

import type { IconName } from '../icons'
import type { Runtime } from '../runtime'

export type LeftTab = 'layers' | 'blocks' | 'sections'

export const LEFT_TABS: readonly { id: LeftTab; label: string; icon: IconName; digit: string }[] = [
  { id: 'layers', label: 'Layers', icon: 'layers', digit: '1' },
  { id: 'blocks', label: 'Blocks', icon: 'grid', digit: '2' },
  { id: 'sections', label: 'Sections', icon: 'section', digit: '3' },
]

const STORAGE_KEY = 'payload-builder:left-tab'

const isLeftTab = (value: unknown): value is LeftTab => LEFT_TABS.some((tab) => tab.id === value)

/** The stored tab. Null when the user never picked one (or storage is blocked). */
export function readLeftTab(): LeftTab | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY)
    return isLeftTab(value) ? value : null
  } catch {
    return null
  }
}

/** The tab for the digit of its shortcut ("1" is Layers). */
export function leftTabForDigit(digit: string): LeftTab | null {
  return LEFT_TABS.find((tab) => tab.digit === digit)?.id ?? null
}

/** The DOM id of a tab's panel. */
export const leftPanelId = (tab: LeftTab) => `builder-left-${tab}`

/**
 * Opens a tab and keeps the choice. `focus` moves the focus into the panel: the search field of
 * Blocks and Sections, the focusable row of Layers.
 */
export function selectLeftTab(runtime: Runtime, tab: LeftTab, { focus = false }: { focus?: boolean } = {}) {
  runtime.leftTab.set(tab)
  try {
    localStorage.setItem(STORAGE_KEY, tab)
  } catch {
    // Storage blocked: the tab lasts for this page only.
  }
  if (!focus) return
  // After the panel renders.
  requestAnimationFrame(() => {
    const panel = document.getElementById(leftPanelId(tab))
    const target = ['input[type="search"]', '[data-outline-row][tabindex="0"]', '.builder-editor__outline']
      .map((selector) => panel?.querySelector<HTMLElement>(selector))
      .find(Boolean)
    target?.focus()
  })
}
