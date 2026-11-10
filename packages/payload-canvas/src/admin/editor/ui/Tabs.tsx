'use client'

// The editor's tab strip: the inspector's Block / Assistant switch, its Content / Styles / Motion
// tabs, and the tabs of a block's Payload `tabs` field. Left and Right arrows (Home, End) move
// between the tabs, as in a WAI-ARIA tab list.

import type { KeyboardEvent } from 'react'

import { Icon, type IconName } from '../icons'

export type TabsProps<T extends string> = {
  value: T
  options: { id: T; label: string; icon?: IconName }[]
  onChange: (id: T) => void
  /** `underline`: the inspector's main tabs. `segmented`: a switch, full width. */
  variant?: 'segmented' | 'underline'
  /** Names the tab list for screen readers. */
  label?: string
  /** The DOM id of a tab's panel, for `aria-controls`. */
  panelId?: (id: T) => string
}

export function Tabs<T extends string>({ value, options, onChange, variant = 'underline', label, panelId }: TabsProps<T>) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const at = options.findIndex((o) => o.id === value)
    const next =
      e.key === 'ArrowRight' ? (at + 1) % options.length : e.key === 'ArrowLeft' ? (at - 1 + options.length) % options.length : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : -1
    if (next === -1) return
    e.preventDefault()
    onChange(options[next].id)
    // The new tab takes the focus after it renders as selected.
    const list = e.currentTarget.parentElement
    requestAnimationFrame(() => list?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }
  return (
    <div
      aria-label={label}
      className={variant === 'segmented' ? 'builder-editor__segmented builder-editor__segmented--full' : 'builder-editor__tabs'}
      role="tablist"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          aria-controls={panelId?.(option.id)}
          tabIndex={value === option.id ? 0 : -1}
          className={variant === 'segmented' ? 'builder-editor__segment' : 'builder-editor__tab'}
          onClick={() => onChange(option.id)}
          onKeyDown={onKeyDown}
        >
          {option.icon && <Icon name={option.icon} size={13} />}
          {option.label}
        </button>
      ))}
    </div>
  )
}
