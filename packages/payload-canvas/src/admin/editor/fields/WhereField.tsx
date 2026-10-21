'use client'

import { Button, FieldLabel, useConfig } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import { dataFields } from '../../../core/fields'
import { Select } from '../ui/Select'
import { JsonField } from './JsonField'
import {
  convertWhereValue,
  parseWhereValue,
  rowsWhere,
  WHERE_OPERATORS,
  whereRows,
  whereValueText,
  type WhereOperator,
  type WhereRow,
} from './whereRows'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  /** The slug of the collection the query runs on, when known: its fields fill the field select. */
  readonly collection?: string
}

const OPERATOR_LABELS: Record<WhereOperator, string> = {
  equals: 'is',
  not_equals: 'is not',
  in: 'is one of',
  not_in: 'is none of',
  greater_than: 'greater than',
  greater_than_equal: 'at least',
  less_than: 'less than',
  less_than_equal: 'at most',
  like: 'has the words',
  contains: 'contains',
  exists: 'exists',
}

const OPERATOR_OPTIONS = WHERE_OPERATORS.map((value) => ({ value, label: OPERATOR_LABELS[value] }))
const YES_NO = [
  { value: 'true', label: 'yes' },
  { value: 'false', label: 'no' },
]

/** A row while it is edited: `text` keeps what the user typed ("a, " while typing a list). */
type EditRow = WhereRow & { text: string }

const editRows = (value: unknown): EditRow[] => (whereRows(value) ?? []).map((row) => ({ ...row, text: whereValueText(row.value) }))

/**
 * A Payload `where` query as rows: field, operator and value, AND-ed. Stores the same where
 * object as the JSON editor. A where the rows cannot show (`or`, nested groups) opens as JSON.
 * "Edit as JSON" switches to the JSON editor.
 */
export function WhereField({ label, description, path, required, value, onChange, collection }: Props) {
  const { config } = useConfig()
  const fields = useMemo(() => {
    const found = config.collections.find((c) => c.slug === collection)
    return found ? dataFields(found.fields as unknown[]).filter((f) => f.type !== 'group' && f.type !== 'array' && f.type !== 'blocks') : []
  }, [config.collections, collection])
  const [json, setJson] = useState(false)
  const [draft, setDraft] = useState(() => ({ rows: editRows(value), source: value }))
  // The value changed from outside (undo, AI edit): show it. Our own edits come back as `source`.
  if (value !== draft.source) setDraft({ rows: editRows(value), source: value })

  const fits = whereRows(value) !== null
  if (json || !fits) {
    return (
      <div className="builder-where">
        <JsonField description={description} label={label} onChange={onChange} path={path} required={required} value={value} />
        {fits ? (
          <button type="button" className="builder-where__switch" onClick={() => setJson(false)}>
            Edit as conditions
          </button>
        ) : (
          <p className="builder-field-group__description">This query uses parts the condition rows cannot show (for example &quot;or&quot;), so it opens as JSON.</p>
        )}
      </div>
    )
  }

  const typeOf = (name: string) => fields.find((f) => f.name === name)?.type
  const update = (rows: EditRow[]) => {
    const where = rowsWhere(rows)
    setDraft({ rows, source: where })
    onChange(where)
  }
  const change = (index: number, patch: Partial<EditRow>) => update(draft.rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
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
        const name = `Condition ${index + 1}`
        return (
          // Rows have no ids of their own; the list only changes by adding at the end or removing.
          // oxlint-disable-next-line react/no-array-index-key
          <fieldset key={index} className="builder-where__row" aria-label={name}>
            {fields.length > 0 ? (
              <Select
                aria-label={`${name}: field`}
                placeholder="Field"
                value={row.field || null}
                options={fieldOptions(row.field)}
                onValueChange={(field) => change(index, { field: field ?? '', value: parseWhereValue(row.text, row.operator, typeOf(field ?? '')) })}
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
            <Select
              aria-label={`${name}: operator`}
              value={row.operator}
              options={OPERATOR_OPTIONS}
              onValueChange={(next) => {
                const operator = (next ?? 'equals') as WhereOperator
                const converted = convertWhereValue(row, operator, typeOf(row.field))
                change(index, { operator, value: converted, text: whereValueText(converted) })
              }}
            />
            {row.operator === 'exists' ? (
              <Select
                aria-label={`${name}: value`}
                value={row.value === false ? 'false' : 'true'}
                options={YES_NO}
                onValueChange={(next) => change(index, { value: next !== 'false', text: next ?? 'true' })}
              />
            ) : (
              <input
                type="text"
                className="builder-where__input"
                aria-label={`${name}: value`}
                placeholder={row.operator === 'in' || row.operator === 'not_in' ? 'a, b, c' : 'Value'}
                value={row.text}
                onChange={(e) => change(index, { text: e.target.value, value: parseWhereValue(e.target.value, row.operator, typeOf(row.field)) })}
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
        onClick={() => update([...draft.rows, { field: '', operator: 'equals', value: '', text: '' }])}
        size="small"
      >
        Add condition
      </Button>
    </div>
  )
}
