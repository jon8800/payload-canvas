'use client'

import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { joinClasses, labelOf, textOr } from '../../../blocks/client/helpers'
import { TABS_CLASS_MAP as C, TABS_LABELS } from '../../../blocks/client/tabs'
import { CANVAS_CONTROL_ATTRIBUTE, useCanvasReveal } from '../../render/reveal'
import type { BlockComponentProps } from '../../render/types'
import { TabsContext, type TabsState } from './tabsContext'

export type TabsLabels = Partial<typeof TABS_LABELS>

/** On the canvas a click on a tab opens it, as on the site, and does not select the block. */
const CONTROL = { [CANVAS_CONTROL_ATTRIBUTE]: '' }

/** The panels' box fills the rest of the row when the tabs stand in a column beside it. */
const PANELS_STYLE: CSSProperties = { flex: '1 1 auto', minWidth: 0 }

/**
 * The tab a key moves to from tab `index` of `count` (WAI-ARIA tabs pattern): the arrow keys of
 * the row's direction step and wrap around, Home and End jump to the ends. Null for other keys.
 */
export function tabStep(key: string, index: number, count: number, vertical: boolean): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  if (key === (vertical ? 'ArrowDown' : 'ArrowRight')) return (index + 1) % count
  if (key === (vertical ? 'ArrowUp' : 'ArrowLeft')) return (index - 1 + count) % count
  return null
}

/**
 * Tabs: a row of tab buttons (`role="tablist"`) made from the tab blocks in the "tabs" slot, and
 * their panels (the tab blocks themselves, see `Tab`). One panel shows at a time; the first one
 * at first. Roving focus: only the open tab is in the Tab order, and the arrow keys move between
 * tabs. On the canvas a click on a tab opens it, and selecting a block opens the tab that holds it.
 */
export function Tabs({ block, props, className, attributes, partAttributes, slots, mode, labels }: BlockComponentProps & { labels?: TabsLabels }) {
  const root = useRef<HTMLDivElement>(null)
  const panels = useRef<HTMLDivElement>(null)
  const buttons = useRef<Array<HTMLButtonElement | null>>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const canvas = mode === 'canvas'
  const vertical = props.vertical === true
  const baseId = useId()
  const tabs = (block.slots?.tabs ?? []).filter((tab) => canvas || !tab.hidden)
  const active = tabs.some((tab) => tab.id === chosen) ? chosen : (tabs[0]?.id ?? null)
  const L = labels ? { ...TABS_LABELS, ...labels } : TABS_LABELS
  const panelClassName = partAttributes.panel?.className

  const state: TabsState = { active, tabId: (id) => `${baseId}tab-${id}`, panelId: (id) => `${baseId}panel-${id}`, panelClassName }

  // Canvas: selecting a block opens the tab whose panel holds it (a panel of this block, not of
  // tabs nested in it).
  useCanvasReveal(root, (target) => {
    for (let el: HTMLElement | null = target; el && el !== root.current; el = el.parentElement) {
      if (el.parentElement === panels.current && el.dataset.tabPanel) return setChosen(el.dataset.tabPanel)
    }
  })

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const to = tabStep(event.key, index, tabs.length, vertical)
    if (to === null) return
    event.preventDefault()
    setChosen(tabs[to]!.id)
    buttons.current[to]?.focus()
  }

  return (
    <div {...attributes} ref={root} className={className}>
      <div
        role="tablist"
        aria-label={textOr(props.label, '') || undefined}
        aria-orientation={vertical ? 'vertical' : undefined}
        data-tabs-list=""
        className={partAttributes.list?.className}
      >
        {tabs.map((tab, i) => {
          const open = tab.id === active
          return (
            <button
              {...CONTROL}
              key={tab.id}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              role="tab"
              id={state.tabId(tab.id)}
              aria-selected={open}
              aria-controls={state.panelId(tab.id)}
              tabIndex={open ? 0 : -1}
              className={joinClasses(C.tab, partAttributes.tab?.className)}
              onClick={() => setChosen(tab.id)}
              onKeyDown={(event) => onKeyDown(event, i)}
            >
              {textOr(tab.props?.label, '') || labelOf(props, L, 'tabLabel', { n: i + 1 })}
            </button>
          )
        })}
      </div>
      <div {...partAttributes.tabs} ref={panels} data-tabs-panels="" style={PANELS_STYLE}>
        <TabsContext value={state}>{slots.tabs}</TabsContext>
      </div>
    </div>
  )
}
