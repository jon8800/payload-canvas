'use client'

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
