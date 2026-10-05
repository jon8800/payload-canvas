'use client'

// The left sidebar: three tabs at the top (Layers, Blocks, Sections), each panel full height.
// Panels stay mounted once opened and hide with the `hidden` attribute: a library item that is
// being dragged must stay mounted (dnd-kit tracks its node) when the tab changes mid-drag.
// While a drag hovers the Layers tab for a moment, the tab opens, so the drop can go in the tree.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

import { remeasureOutline } from '../dnd/smooth'
import { Icon } from '../icons'
import { Library } from '../Library'
import { isMac } from '../menu/keys'
import { Outline } from '../Outline'
import { useRuntime } from '../runtime'
import { useValue } from '../valueStore'
import { LEFT_TABS, leftPanelId, selectLeftTab, type LeftTab } from './leftTabs'

/** How long a drag must rest on the Layers tab before it opens. */
const DRAG_OPEN_MS = 350

const tabId = (tab: LeftTab) => `builder-left-tab-${tab}`

export function LeftPanel() {
  const runtime = useRuntime()
  const stored = useValue(runtime.leftTab)
  // Without a stored choice, an empty page starts in Blocks and a page with blocks in Layers.
  const [fallback] = useState<LeftTab>(() => (runtime.store.getState().layout.blocks.length === 0 ? 'blocks' : 'layers'))
  const tab = stored ?? fallback
  // Panels render the first time they open, then stay mounted.
  const [opened, setOpened] = useState<ReadonlySet<LeftTab>>(() => new Set<LeftTab>(['layers', tab]))
  if (!opened.has(tab)) setOpened(new Set([...opened, tab]))
  const tablistRef = useRef<HTMLDivElement>(null)

  const saved = useValue(runtime.sections.saved)
  const sectionCount = (runtime.config.sections?.length ?? 0) + (saved?.length ?? 0)
  // Saved sections load once, in the background (the tab shows their count).
  useEffect(() => {
    void runtime.sections.load()
  }, [runtime])

  // The tab that opens shows the selected layer; a drag in progress measures the tree again.
  useLayoutEffect(() => {
    if (tab !== 'layers') return
    if (runtime.drag.get()) {
      remeasureOutline(runtime)
      return
    }
    const id = runtime.store.getState().selectedId
    if (id) runtime.outlineRef.current?.querySelector(`[data-outline-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [runtime, tab])

  // A drag that rests on the Layers tab opens it, like a tab bar in a browser.
  useEffect(() => {
    const list = tablistRef.current
    if (!list) return
    const layers = list.querySelector<HTMLElement>('[data-tab="layers"]')
    let timer = 0
    let over: HTMLElement | null = null
    // Measured once per drag: the tab does not move while dragging.
    let box: DOMRect | null = null
    const leave = () => {
      window.clearTimeout(timer)
      over?.removeAttribute('data-drag-over')
      over = null
    }
    const unsubscribe = runtime.drag.subscribe(() => {
      const drag = runtime.drag.get()
      if (!drag) box = null
      else box ??= layers?.getBoundingClientRect() ?? null
      const p = drag?.pointer
      const inside = Boolean(p && box && p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom)
      if (!inside || !layers || runtime.leftTab.get() === 'layers') {
        leave()
        return
      }
      if (over === layers) return
      over = layers
      layers.setAttribute('data-drag-over', '')
      timer = window.setTimeout(() => {
        leave()
        selectLeftTab(runtime, 'layers')
      }, DRAG_OPEN_MS)
    })
    return () => {
      unsubscribe()
      leave()
    }
  }, [runtime])

  // Arrow keys, Home and End move between the tabs (WAI-ARIA tabs with automatic activation).
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const index = LEFT_TABS.findIndex((t) => t.id === tab)
    const last = LEFT_TABS.length - 1
    const next =
      e.key === 'ArrowRight' ? (index + 1) % LEFT_TABS.length : e.key === 'ArrowLeft' ? (index + last) % LEFT_TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? last : null
    if (next === null) return
    e.preventDefault()
    e.stopPropagation()
    const id = LEFT_TABS[next]?.id
    if (!id) return
    selectLeftTab(runtime, id)
    document.getElementById(tabId(id))?.focus()
  }

  const alt = isMac() ? '⌥' : 'Alt+'
  return (
    <>
      <div className="builder-left__head">
        <div
          ref={tablistRef}
          className="builder-editor__segmented builder-editor__segmented--full"
          role="tablist"
          aria-label="Left panel"
        >
          {LEFT_TABS.map(({ id, label, icon, digit }) => (
            <button
              key={id}
              id={tabId(id)}
              type="button"
              role="tab"
              data-tab={id}
              aria-selected={tab === id}
              aria-controls={leftPanelId(id)}
              aria-keyshortcuts={`Alt+${digit}`}
              tabIndex={tab === id ? 0 : -1}
              className="builder-editor__segment"
              data-tooltip={`${label} (${alt}${digit})`}
              onClick={() => selectLeftTab(runtime, id)}
              onKeyDown={onKeyDown}
            >
              <Icon name={icon} size={13} />
              {label}
              {id === 'sections' && sectionCount > 0 && <span className="builder-editor__segment-count">{sectionCount}</span>}
            </button>
          ))}
        </div>
      </div>
      {LEFT_TABS.map(({ id }) => (
        <div key={id} id={leftPanelId(id)} role="tabpanel" aria-labelledby={tabId(id)} className="builder-left__panel" hidden={tab !== id}>
          {opened.has(id) && (id === 'layers' ? <Outline /> : <Library kind={id} />)}
        </div>
      ))}
    </>
  )
}
