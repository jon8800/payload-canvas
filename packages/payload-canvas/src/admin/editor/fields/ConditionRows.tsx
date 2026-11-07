'use client'

// Condition rows: field, operator, value and a remove button, in "or" groups of "and" rows. Shared
// by the where builder (WhereField: a Payload `where` query) and the visibility conditions (a
// block's `visibility`). The value input follows the field's Payload type (a select's options, a
// date, a number, a document picker, checked / not checked), and a row's value can come from
// another source (a relative date, a page field, a URL parameter, another field) when the caller
// offers it. The caller turns the groups into its own stored value. The rules live in conditions.ts.

import { RelationshipInput, SelectInput } from '@payloadcms/ui'
import { Fragment, useId, useState } from 'react'

import { pageToken, pageTokenPath, parseDateToken, queryToken, queryTokenParam } from '../../../core/whereValues'
import { Select, type SelectEntry } from '../ui/Select'
import { AddButton, RemoveRowButton } from './AddButton'
import {
  changeRelativeDate,
  compatibleFields,
  operatorOptions,
  RELATIVE_DATE_OPTIONS,
  relativeDateKey,
  rowSource,
  rowSources,
  SOURCE_LABELS,
  valueInputOf,
  withField,
  withOperator,
  withSource,
  type ConditionFieldOption,
  type ConditionRow,
  type ConditionSources,
  type ValueSource,
} from './conditions'
import { fromRelationshipInput, toRelationshipInput } from './values'
import { parseWhereValue, whereValueText } from './whereRows'

export type { ConditionFieldOption, ConditionRow, ConditionSources } from './conditions'

type Props = {
  /** "Or" groups of "and" rows. */
  readonly groups: ConditionRow[][]
  /** Called with every group and row (rows without a field too: the caller leaves those out of the stored value). */
  readonly onChange: (groups: ConditionRow[][]) => void
  /** The fields to pick from. Empty: the field is a text input. */
  readonly fields: ConditionFieldOption[]
  /** The value sources besides a fixed value. */
  readonly sources?: ConditionSources
  /** The operator of a new row, before a field is picked. */
  readonly defaultOperator: string
}

const CHECKED = [
  { value: 'true', label: 'checked' },
  { value: 'false', label: 'not checked' },
]

/** The select value of a field option: the path, with a prefix for "number of items". */
const optionKey = (path: string, count?: boolean) => (count ? `#${path}` : path)

const fieldOf = (fields: readonly ConditionFieldOption[], row: ConditionRow) =>
  fields.find((f) => f.path === row.field && Boolean(f.count) === Boolean(row.count))

/** The field select: the fields, then "Number of items" for counts, and the row's own path when it is not listed. */
function fieldEntries(fields: readonly ConditionFieldOption[], row: ConditionRow): SelectEntry[] {
  const entries: SelectEntry[] = fields.filter((f) => !f.count).map((f) => ({ value: optionKey(f.path), label: f.label }))
  const counts = fields.filter((f) => f.count).map((f) => ({ value: optionKey(f.path, true), label: `${f.label} (count)` }))
  if (counts.length > 0) entries.push({ group: 'Number of items', options: counts })
  if (row.field && !fieldOf(fields, row)) entries.unshift({ value: optionKey(row.field, row.count), label: row.count ? `${row.field} (count)` : row.field })
  return entries
}

const newRow = (operator: string): ConditionRow => ({ field: '', operator, value: '', text: '' })

/**
 * The condition groups. With one group, "Add condition" and "Add “or” group" sit side by side
 * under the rows; with several, each boxed group has its own "Add condition".
 */
export function ConditionRows({ groups, onChange, fields, sources, defaultOperator }: Props) {
  const multi = groups.length > 1
  const changeGroup = (g: number, rows: ConditionRow[]) =>
    // A group without rows is gone.
    onChange(rows.length === 0 ? groups.filter((_, i) => i !== g) : groups.map((group, i) => (i === g ? rows : group)))
  const addOrGroup = (
    <AddButton onClick={() => onChange([...groups, [newRow(defaultOperator)]])}>Add “or” group</AddButton>
  )

  if (groups.length === 0) {
    return <AddButton onClick={() => onChange([[newRow(defaultOperator)]])}>Add condition</AddButton>
  }

  return (
    <div className="builder-conditions">
      {groups.map((group, g) => {
        const groupName = multi ? `Group ${g + 1}` : ''
        return (
          // Groups and rows have no ids of their own; the lists change by adding at the end or removing.
          // oxlint-disable-next-line react/no-array-index-key
          <Fragment key={g}>
            {g > 0 && (
              <p className="builder-conditions__or" aria-hidden="true">
                or
              </p>
            )}
            <fieldset className={`builder-conditions__group${multi ? ' builder-conditions__group--boxed' : ''}`} aria-label={multi ? `${groupName}: all of these match` : undefined}>
              {multi && <legend className="builder-conditions__legend">{g === 0 ? 'All of these' : 'Or all of these'}</legend>}
              {group.map((row, r) => {
                const name = multi ? `${groupName}, condition ${r + 1}` : `Condition ${r + 1}`
                return (
                  // oxlint-disable-next-line react/no-array-index-key
                  <Fragment key={r}>
                    {r > 0 && (
                      <p className="builder-conditions__and" aria-hidden="true">
                        and
                      </p>
                    )}
                    <ConditionRowEditor
                      row={row}
                      name={name}
                      fields={fields}
                      sources={sources}
                      onChange={(next) => changeGroup(g, group.map((old, i) => (i === r ? next : old)))}
                      onRemove={() => changeGroup(g, group.filter((_, i) => i !== r))}
                    />
                  </Fragment>
                )
              })}
              {multi && (
                <AddButton
                  aria-label={`Add a condition to ${groupName.toLowerCase()}`}
                  onClick={() => changeGroup(g, [...group, newRow(defaultOperator)])}
                >
                  Add condition
                </AddButton>
              )}
            </fieldset>
          </Fragment>
        )
      })}
      <div className="builder-add-row">
        {!multi && <AddButton onClick={() => changeGroup(0, [...groups[0]!, newRow(defaultOperator)])}>Add condition</AddButton>}
        {addOrGroup}
      </div>
    </div>
  )
}

type RowProps = {
  readonly row: ConditionRow
  readonly name: string
  readonly fields: ConditionFieldOption[]
  readonly sources?: ConditionSources
  readonly onChange: (row: ConditionRow) => void
  readonly onRemove: () => void
}

/** One row: field, operator, remove; then where the value comes from and the value. */
function ConditionRowEditor({ row, name, fields, sources, onChange, onRemove }: RowProps) {
  const field = fieldOf(fields, row)
  const offered = rowSources(field, row.operator, sources)
  const source = rowSource(row, sources)
  const input = valueInputOf(field, row.operator)
  const sourceOptions = (offered.includes(source) ? offered : [source, ...offered]).map((value) => ({ value, label: SOURCE_LABELS[value] }))

  return (
    <fieldset className="builder-where__row" aria-label={name}>
      {fields.length > 0 ? (
        <Select
          aria-label={`${name}: field`}
          placeholder="Field"
          value={row.field ? optionKey(row.field, row.count) : null}
          options={fieldEntries(fields, row)}
          onValueChange={(key) => {
            const picked = fields.find((f) => optionKey(f.path, f.count) === key)
            onChange(withField(row, picked, picked?.path ?? key ?? ''))
          }}
        />
      ) : (
        <input
          type="text"
          className="builder-where__input"
          aria-label={`${name}: field`}
          placeholder="Field"
          value={row.field}
          onChange={(e) => onChange({ ...row, field: e.target.value })}
        />
      )}
      <Select
        aria-label={`${name}: operator`}
        value={row.operator}
        options={operatorOptions(field, row.operator)}
        onValueChange={(next) => onChange(withOperator(row, next ?? row.operator, field, sources))}
      />
      <RemoveRowButton label={`Remove ${name.toLowerCase()}`} onClick={onRemove} />
      {input.kind !== 'none' && (
        <div className="builder-where__value">
          {sourceOptions.length > 1 && (
            <Select
              aria-label={`${name}: value from`}
              className="builder-where__source"
              value={source}
              options={sourceOptions}
              onValueChange={(next) => onChange(withSource(row, (next ?? 'fixed') as ValueSource, field, sources))}
            />
          )}
          <SourceValue row={row} name={name} field={field} source={source} sources={sources} onChange={onChange} />
        </div>
      )}
    </fieldset>
  )
}

type ValueProps = {
  readonly row: ConditionRow
  readonly name: string
  readonly field: ConditionFieldOption | undefined
  readonly onChange: (row: ConditionRow) => void
}

/** The value input of the row's source. */
function SourceValue({ row, name, field, source, sources, onChange }: ValueProps & { readonly source: ValueSource; readonly sources?: ConditionSources }) {
  const setValue = (value: unknown) => onChange({ ...row, value, text: '' })
  const fieldSelect = (candidates: ConditionFieldOption[], value: string | null, placeholder: string, set: (path: string) => void) => (
    <Select
      aria-label={`${name}: ${placeholder.toLowerCase()}`}
      placeholder={placeholder}
      value={value || null}
      options={candidates.map((f) => ({ value: f.path, label: f.label }))}
      onValueChange={(path) => set(path ?? '')}
    />
  )

  switch (source) {
    case 'date': {
      const date = parseDateToken(row.value) ?? { amount: 0, unit: 'd' as const, direction: -1 as const }
      const key = relativeDateKey(date)
      return (
        <div className="builder-where__inline">
          {key !== 'now' && (
            <AmountInput
              label={`${name}: number of ${date.unit === 'h' ? 'hours' : 'days'}`}
              value={date.amount}
              onCommit={(amount) => setValue(changeRelativeDate(date, { amount }))}
            />
          )}
          <Select
            aria-label={`${name}: relative date`}
            value={key}
            options={RELATIVE_DATE_OPTIONS}
            onValueChange={(next) => setValue(changeRelativeDate(date, { key: next ?? 'now' }))}
          />
        </div>
      )
    }
    case 'page':
      return fieldSelect(compatibleFields(field, sources?.page ?? []), pageTokenPath(row.value), 'Page field', (path) => setValue(pageToken(path)))
    case 'field':
      return fieldSelect(compatibleFields(field, sources?.field ?? [], true), row.valueField ?? null, 'Other field', (path) => onChange({ ...row, value: undefined, text: '', valueField: path }))
    case 'query':
      return (
        <div className="builder-where__inline">
          <span className="builder-where__prefix" aria-hidden="true">
            ?
          </span>
          <input
            type="text"
            className="builder-where__input"
            aria-label={`${name}: URL parameter`}
            title="The editor preview ignores this condition."
            placeholder="category"
            value={queryTokenParam(row.value) ?? ''}
            onChange={(e) => setValue(queryToken(e.target.value.trim()))}
          />
        </div>
      )
    default:
      return <FixedValue row={row} name={name} field={field} onChange={onChange} />
  }
}

/** A number of days or hours: keeps what is typed, and stores only whole numbers from 1. */
function AmountInput({ label, value, onCommit }: { readonly label: string; readonly value: number; readonly onCommit: (amount: number) => void }) {
  const [text, setText] = useState(String(value))
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(String(value))
  }
  return (
    <input
      type="number"
      min={1}
      step={1}
      className="builder-where__input builder-where__input--amount"
      aria-label={label}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const amount = Math.floor(Number(e.target.value))
        if (amount >= 1) onCommit(amount)
      }}
      onBlur={() => setText(String(value))}
    />
  )
}

/** The date part of a stored date ("2026-01-31" of "2026-01-31T00:00:00.000Z") for a date input. */
const dateInputValue = (value: unknown) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '')

/** A fixed value, typed by the field: a select's options, checked, a number, a date, documents, or text. */
function FixedValue({ row, name, field, onChange }: ValueProps) {
  const id = useId()
  const input = valueInputOf(field, row.operator)
  const type = field?.count ? 'number' : field?.type
  const typed = (text: string) => onChange({ ...row, text, value: parseWhereValue(text, row.operator, type) })

  switch (input.kind) {
    case 'checkbox':
      return (
        <Select
          aria-label={`${name}: value`}
          value={row.value === false ? 'false' : 'true'}
          options={CHECKED}
          onValueChange={(next) => onChange({ ...row, value: next !== 'false', text: '' })}
        />
      )
    case 'number':
      return (
        <div className="builder-where__inline">
          <input
            type="number"
            className="builder-where__input"
            aria-label={`${name}: value`}
            placeholder="0"
            value={row.text || whereValueText(row.value)}
            onChange={(e) => typed(e.target.value)}
          />
          {field?.count && <span className="builder-where__suffix">items</span>}
        </div>
      )
    case 'date':
      return (
        <input
          type="date"
          className="builder-where__input"
          aria-label={`${name}: date`}
          value={dateInputValue(row.value)}
          onChange={(e) => onChange({ ...row, value: e.target.value, text: '' })}
        />
      )
    case 'options': {
      const options = (field?.options ?? []).map((o) => ({ label: o.label, value: o.value }))
      if (!input.multiple) {
        return (
          <Select
            aria-label={`${name}: value`}
            placeholder="Choose"
            value={typeof row.value === 'string' && row.value ? row.value : null}
            options={options}
            onValueChange={(next) => onChange({ ...row, value: next ?? '', text: '' })}
          />
        )
      }
      return (
        <SelectInput
          className="builder-where__payload"
          hasMany
          isClearable
          name={`${id}-value`}
          path={`${id}-value`}
          options={options}
          placeholder="Choose"
          value={Array.isArray(row.value) ? row.value.map(String) : []}
          onChange={(next: unknown) => {
            const list = Array.isArray(next) ? next.map((o: { value: unknown }) => String(o.value)) : []
            onChange({ ...row, value: list, text: '' })
          }}
        />
      )
    }
    case 'documents': {
      const relationTo = [String(field?.relationTo)]
      const shared = { className: 'builder-where__payload', path: `${id}-value`, relationTo, allowCreate: false, allowEdit: false, placeholder: 'Choose' }
      const set = (next: unknown) => onChange({ ...row, value: fromRelationshipInput(next, false) ?? '', text: '' })
      return input.multiple ? (
        <RelationshipInput {...shared} hasMany onChange={set} value={toRelationshipInput(Array.isArray(row.value) ? row.value : [], relationTo, false, true) as never} />
      ) : (
        <RelationshipInput {...shared} hasMany={false} onChange={set} value={toRelationshipInput(row.value === '' ? null : row.value, relationTo, false, false) as never} />
      )
    }
    default:
      return (
        <input
          type="text"
          className="builder-where__input"
          aria-label={`${name}: value`}
          placeholder={input.multiple ? 'a, b, c' : 'Value'}
          value={row.text}
          onChange={(e) => typed(e.target.value)}
        />
      )
  }
}
