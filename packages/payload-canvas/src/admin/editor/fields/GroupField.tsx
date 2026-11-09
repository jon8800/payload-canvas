'use client'

import { useState, type ReactNode } from 'react'
import type { Field } from 'payload'

import { Icon } from '../icons'
import { RenderBlockFields } from '../renderField'
import { Tabs } from '../ui/Tabs'

type Props = {
  readonly fields: Field[]
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly value: unknown
  /** The whole group object, or `undefined` when every sub-field is empty. */
  readonly onChange: (value: Record<string, unknown> | undefined) => void
}

/**
 * Fields that share the parent's data, under a small heading: a collapsible, or one of several
 * unnamed tabs. Looks like a group, but stores nothing of its own. `collapsed`: a collapsible with
 * `admin.initCollapsed` starts folded, and its heading opens it.
 */
export function FieldSection({
  label,
  description,
  collapsed,
  children,
}: {
  readonly label: string
  readonly description?: string
  readonly collapsed?: boolean
  readonly children: ReactNode
}) {
  if (collapsed !== undefined) {
    return (
      <details className="builder-field-group builder-field-group--fold" open={!collapsed}>
        <summary className="builder-field-group__label">{label}</summary>
        {description && <p className="builder-field-group__description">{description}</p>}
        <div className="builder-field-group__fields">{children}</div>
      </details>
    )
  }
  return (
    <fieldset className="builder-field-group">
      <legend className="builder-field-group__label">{label}</legend>
      <div className="builder-field-group__fields">{children}</div>
    </fieldset>
  )
}

/** A named group: a small heading over its sub-fields, which edit one nested object. */
export function GroupField({ fields, label, description, path, value, onChange }: Props) {
  return (
    <fieldset className="builder-field-group">
      <legend className="builder-field-group__label">{label}</legend>
      {description && <p className="builder-field-group__description">{description}</p>}
      <div className="builder-field-group__fields">
        <RenderBlockFields fields={fields} data={value} path={path} onChange={onChange} />
      </div>
    </fieldset>
  )
}

/** The tab each set of tabs showed last, by its tab labels: moving to another field keeps the tab. */
const chosenTabs = new Map<string, string>()

/**
 * A Payload `tabs` field with several tabs: a tab strip, then the fields of the chosen tab.
 * `render` gives the content of one tab (by index). The choice stays while the editor is open.
 */
export function FieldTabs({ labels, path, render }: { readonly labels: string[]; readonly path: string; readonly render: (index: number) => ReactNode }) {
  const key = labels.join('\u0000')
  const [chosen, setChosen] = useState(() => chosenTabs.get(key) ?? labels[0])
  const index = Math.max(0, labels.indexOf(chosen))
  const panelId = (label: string) => `${path.replace(/\W/g, '_')}-tab-${labels.indexOf(label)}`
  return (
    <div className="builder-field-tabs">
      <Tabs
        variant="segmented"
        value={labels[index]}
        options={labels.map((label) => ({ id: label, label }))}
        panelId={panelId}
        onChange={(label) => {
          chosenTabs.set(key, label)
          setChosen(label)
        }}
      />
      <div className="builder-field-tabs__panel" id={panelId(labels[index])} role="tabpanel" aria-label={labels[index]}>
        {render(index)}
      </div>
    </div>
  )
}

/**
 * A section of a settings panel (form settings): a heading that opens and closes it, over its
 * fields. `open`: open at first.
 */
export function PanelSection({ label, open = false, children }: { readonly label: string; readonly open?: boolean; readonly children: ReactNode }) {
  return (
    <details className="builder-panel-section" open={open}>
      <summary className="builder-panel-section__head">
        <span>{label}</span>
        <Icon name="chevronDown" size={14} className="builder-panel-section__chevron" />
      </summary>
      <div className="builder-panel-section__fields">{children}</div>
    </details>
  )
}
