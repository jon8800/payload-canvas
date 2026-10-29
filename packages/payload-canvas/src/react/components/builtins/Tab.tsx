'use client'

import { useContext } from 'react'
import { joinClasses } from '../../../blocks/client/helpers'
import type { BlockComponentProps } from '../../render/types'
import { TabsContext } from './tabsContext'

/**
 * One panel of a tabs block (`role="tabpanel"`), labelled by its tab button. Only the open tab's
 * panel shows; the others stay in the HTML with `hidden`. Outside a tabs block it renders its
 * content in a plain element.
 */
export function Tab({ block, className, attributes, partAttributes, slots }: BlockComponentProps) {
  const tabs = useContext(TabsContext)
  if (!tabs) {
    return (
      <div {...attributes} {...partAttributes.content} className={className}>
        {slots.content}
      </div>
    )
  }
  const open = tabs.active === block.id
  return (
    <div
      {...attributes}
      {...partAttributes.content}
      id={tabs.panelId(block.id)}
      role="tabpanel"
      aria-labelledby={tabs.tabId(block.id)}
      // The panel takes the focus after the tab row (WAI-ARIA tabs pattern).
      // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      hidden={!open}
      data-tab-panel={block.id}
      className={joinClasses(tabs.panelClassName, className) || undefined}
    >
      {slots.content}
    </div>
  )
}
