'use client'

import { Button, FieldLabel } from '@payloadcms/ui'
import { useState } from 'react'

import { Select } from '../ui/Select'
import { useCollectionFields } from './collectionFields'
import { JsonField } from './JsonField'
import { queryFilterRows, rowsQueryFilters, type QueryFilterRow } from './queryFilterRows'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  /** The slug of the listed collection, when known: its fields fill the field select. */
  readonly collection?: string
}

/**
 * A collection list's URL filters as rows: a URL parameter and the field it filters
 * (`?category=news` lists documents whose field is "news"). Stores `{ [param]: field }`. A value
 * that maps URL values to where queries (the full form) opens as JSON. "Edit as JSON" switches
 * to the JSON editor.
 */
export function QueryFiltersField({ label, description, path, required, value, onChange, collection }: Props) {
  const fields = useCollectionFields(collection)
  const [json, setJson] = useState(false)
  const [draft, setDraft] = useState(() => ({ rows: queryFilterRows(value) ?? [], source: value }))
  // The value changed from outside (undo, AI edit): show it. Our own edits come back as `source`.
  if (value !== draft.source) setDraft({ rows: queryFilterRows(value) ?? [], source: value })

  const fits = queryFilterRows(value) !== null
  if (json || !fits) {
    return (
      <div className="builder-where">
        <JsonField description={description} label={label} onChange={onChange} path={path} required={required} value={value} />
        {fits ? (
          <button type="button" className="builder-where__switch" onClick={() => setJson(false)}>
            Edit as rows
          </button>
        ) : (
          <p className="builder-field-group__description">
            These filters map URL values to queries, which the rows cannot show, so they open as JSON.
          </p>
        )}
      </div>
    )
  }

  const update = (rows: QueryFilterRow[]) => {
    const next = rowsQueryFilters(rows)
    setDraft({ rows, source: next })
    onChange(next)
  }
  const change = (index: number, patch: Partial<QueryFilterRow>) => update(draft.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  const fieldOptions = (current: string) => {
    const options = fields.map((f) => ({ value: f.name, label: f.name }))
    return current && !options.some((o) => o.value === current) ? [{ value: current, label: current }, ...options] : options
  }

  return (
    <div className="builder-where">
      <div className="builder-where__head">
        <FieldLabel label={label} path={path} required={required} />
        <button type="button" className="builder-where__switch" onClick={() => setJson(true)}>
          Edit as JSON
        </button>
      </div>
      {description && <p className="builder-field-group__description">{description}</p>}
      {draft.rows.map((row, index) => {
        const name = `URL filter ${index + 1}`
        return (
          // Rows have no ids of their own; the list only changes by adding at the end or removing.
          // oxlint-disable-next-line react/no-array-index-key
          <fieldset key={index} className="builder-where__row builder-where__row--pair" aria-label={name}>
            <input
              type="text"
              className="builder-where__input"
              aria-label={`${name}: URL parameter`}
              placeholder="URL parameter"
              value={row.param}
              onChange={(e) => change(index, { param: e.target.value })}
            />
            {fields.length > 0 ? (
              <Select
                aria-label={`${name}: field`}
                placeholder="Field"
                value={row.field || null}
                options={fieldOptions(row.field)}
                onValueChange={(field) => change(index, { field: field ?? '' })}
              />
            ) : (
              <input
                type="text"
                className="builder-where__input"
                aria-label={`${name}: field`}
                placeholder="Field"
                value={row.field}
                onChange={(e) => change(index, { field: e.target.value })}
              />
            )}
            <button
              type="button"
              className="builder-where__remove"
              aria-label={`Remove ${name.toLowerCase()}`}
              onClick={() => update(draft.rows.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </fieldset>
        )
      })}
      <Button
        buttonStyle="secondary"
        icon="plus"
        iconPosition="left"
        iconStyle="with-border"
        margin={false}
        onClick={() => update([...draft.rows, { param: '', field: '' }])}
        size="small"
      >
        Add URL filter
      </Button>
    </div>
  )
}
