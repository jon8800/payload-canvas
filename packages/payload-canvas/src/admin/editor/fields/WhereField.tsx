'use client'

import { FieldLabel } from '@payloadcms/ui'
import { useMemo, useState } from 'react'

import { optionList, textOf, type DataField } from '../../../core/fields'
import { useCollectionFields } from './collectionFields'
import { ConditionRows, type ConditionFieldOption, type ConditionRow, type ConditionSources } from './ConditionRows'
import { JsonField } from './JsonField'
import { groupsWhere, whereGroups, whereValueText, type WhereRow } from './whereRows'

type Props = {
  readonly label: string
  readonly description?: string
  readonly path: string
  readonly required: boolean
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  /** The slug of the collection the query runs on, when known: its fields fill the field select. */
  readonly collection?: string
  /** Value sources besides a fixed value: relative dates, page fields, URL parameters. */
  readonly sources?: ConditionSources
}

const editGroups = (value: unknown): ConditionRow[][] =>
  (whereGroups(value) ?? []).map((group) => group.map((row) => ({ ...row, text: whereValueText(row.value) })))

/** A collection field as a condition field: its label, type, options and related collection. */
export function whereFieldOption(field: DataField): ConditionFieldOption {
  const out: ConditionFieldOption = { path: field.name, label: textOf(field.label) ?? field.name, type: field.type }
  if (field.hasMany) out.hasMany = true
  if (field.relationTo !== undefined) out.relationTo = field.relationTo
  if (field.type === 'select' || field.type === 'radio') out.options = optionList(field)
  return out
}

/**
 * A Payload `where` query as condition rows: rows in a group are AND-ed, groups are OR-ed
 * (`{ or: [...] }`). Stores the same where object as the JSON editor. A where the rows cannot
 * show (nested groups, unknown operators) opens as JSON, so nothing is lost. "Edit as JSON"
 * switches to the JSON editor. Used by the collection list's `where` (`admin.custom.builderWhere`,
 * through ListWhereField) and by the templates' conditions field.
 */
export function WhereField({ label, description, path, required, value, onChange, collection, sources }: Props) {
  const collectionFields = useCollectionFields(collection)
  const fields = useMemo(() => collectionFields.map(whereFieldOption), [collectionFields])
  const [json, setJson] = useState(false)
  const [draft, setDraft] = useState(() => ({ groups: editGroups(value), source: value }))
  // The value changed from outside (undo, AI edit): show it. Our own edits come back as `source`.
  if (value !== draft.source) setDraft({ groups: editGroups(value), source: value })

  const fits = whereGroups(value) !== null
  if (json || !fits) {
    return (
      <div className="builder-where">
        <JsonField description={description} label={label} onChange={onChange} path={path} required={required} value={value} />
        {fits ? (
          <button type="button" className="builder-where__switch" onClick={() => setJson(false)}>
            Edit as conditions
          </button>
        ) : (
          <p className="builder-field-group__description">
            Too complex for condition rows, so it opens as JSON.
          </p>
        )}
      </div>
    )
  }

  const update = (groups: ConditionRow[][]) => {
    const where = groupsWhere(groups as WhereRow[][])
    setDraft({ groups, source: where })
    onChange(where)
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
      <ConditionRows groups={draft.groups} onChange={update} fields={fields} sources={sources} defaultOperator="equals" />
    </div>
  )
}
