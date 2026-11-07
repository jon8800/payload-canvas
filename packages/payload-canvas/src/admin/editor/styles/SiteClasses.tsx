'use client'

// "Site classes": the site's own `@utility` classes (StyleTokens.siteClasses) as presets. A click
// adds the class to the block, or removes it when the block has it, like typing it in Classes.

import { useState } from 'react'

import type { SiteClass } from '../../../core/types'
import { useStyles } from './context'
import * as I from './icons'

/** The presets by group, in CSS order. Classes without a group go under "Other" (or no heading when no class has a group). */
export function groupSiteClasses(list: readonly SiteClass[]): Array<{ group: string | null; classes: SiteClass[] }> {
  const groups = new Map<string | null, SiteClass[]>()
  const anyGroup = list.some((c) => c.group)
  for (const item of list) {
    const key = item.group ?? (anyGroup ? 'Other' : null)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups].map(([group, classes]) => ({ group, classes }))
}

/** The class list with `name` added at the end, or removed when it is there (without variants). */
export function toggleClass(className: string, name: string): string {
  const list = className.split(/\s+/).filter(Boolean)
  return (list.includes(name) ? list.filter((c) => c !== name) : [...list, name]).join(' ')
}

export function SiteClasses() {
  const { tokens, className, setClassName } = useStyles()
  const list = tokens.siteClasses ?? []
  const [open, setOpen] = useState(() => list.some((c) => className.split(/\s+/).includes(c.name)))
  if (list.length === 0) return null
  const own = new Set(className.split(/\s+/))
  return (
    <section className="builder-styles__section" data-open={open}>
      <button type="button" className="builder-styles__section-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="builder-styles__chevron">
          <I.ChevronIcon />
        </span>
        Site classes
        {list.some((c) => own.has(c.name)) && <span className="builder-styles__dot" data-tooltip="The block uses a site class" />}
      </button>
      {open && (
        <div className="builder-styles__section-body">
          {groupSiteClasses(list).map(({ group, classes }) => (
            <fieldset key={group ?? ''} className="builder-styles__presets" aria-label={group ? undefined : 'Site classes'}>
              {group && <legend className="builder-styles__presets-title">{group}</legend>}
              <div className="builder-styles__presets-list">
                {classes.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="builder-styles__preset"
                    aria-pressed={own.has(item.name)}
                    data-tooltip={item.css ? `.${item.name} { ${item.css} }` : `.${item.name}`}
                    onClick={() => setClassName(toggleClass(className, item.name))}
                  >
                    <span className="builder-styles__preset-label">{item.label ?? item.name}</span>
                    {item.label && <code className="builder-styles__preset-name">{item.name}</code>}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  )
}
