'use client'

import type { ReactNode } from 'react'
import type { Field } from 'payload'

import { RenderBlockFields } from '../renderField'

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
 * unnamed tabs. Looks like a group, but stores nothing of its own.
 */
export function FieldSection({ label, children }: { readonly label: string; readonly children: ReactNode }) {
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
