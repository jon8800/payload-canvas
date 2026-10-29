// The condition rows' rules, shared by the where builder (WhereField) and the visibility
// conditions: which operators a field type offers and their plain-language labels, which value
// input a row shows, where a row's value comes from, and a one-line summary. Pure, so it is
// tested without React. ConditionRows.tsx draws the rows.

import {
  LIST_OPERATORS,
  VALUELESS_OPERATORS,
  VISIBILITY_OPERATORS,
  type VisibilityOperator,
} from '../../../core/visibility'
import { dateToken, pageToken, pageTokenPath, parseDateToken, queryToken, queryTokenParam, type RelativeDate } from '../../../core/whereValues'
import { parseWhereValue, whereValueText } from './whereRows'

/** The operators of every condition row: Payload's where operators, with `exists` as "is set" / "is empty". */
export type ConditionOperator = VisibilityOperator

/** A field the rows can test. `count`: the option tests the number of items of the field. */
export type ConditionFieldOption = {
  path: string
  label: string
  /** Payload field type. Unknown (a path typed by hand): every operator and a text value. */
  type?: string
  count?: boolean
  hasMany?: boolean
  relationTo?: string | string[]
  /** Select and radio options. */
  options?: ReadonlyArray<{ label: string; value: string }>
}

/** One row while it is edited: `text` keeps what the user typed ("a, " while typing a list). */
export type ConditionRow = {
  field: string
  operator: string
  value: unknown
  text: string
  /** The row compares the number of items of the field (visibility conditions only). */
  count?: boolean
  /** The row compares with this field instead of `value` (visibility conditions only). */
  valueField?: string
}

/**
 * Where a row's value comes from: a fixed value, a date relative to now (`$now-30d`), a field of
 * the page's document (`$page.<path>`), a URL query value (`$query.<param>`), or another field
 * of the same document (`valueField`).
 */
export type ValueSource = 'fixed' | 'date' | 'page' | 'query' | 'field'

/** The value sources a caller offers besides a fixed value. */
export type ConditionSources = {
  /** Dates relative to now, for date fields. */
  date?: boolean
  /** URL query values. */
  query?: boolean
  /** Fields of the page's document (paths without `$page.`). */
  page?: ConditionFieldOption[]
  /** Other fields of the same document (visibility conditions). */
  field?: ConditionFieldOption[]
}

export const SOURCE_LABELS: Record<ValueSource, string> = {
  fixed: 'Value',
  date: 'Relative date',
  page: 'Page field',
  query: 'URL parameter',
  field: 'Other field',
}

const TEXT_TYPES = new Set(['text', 'textarea', 'email', 'code', 'richText', 'json'])
const CHOICE_TYPES = new Set(['select', 'radio'])
const DOCUMENT_TYPES = new Set(['relationship', 'upload'])

const TEXT_OPERATORS: ConditionOperator[] = ['equals', 'not_equals', 'contains', 'like', 'in', 'not_in', 'is_set', 'is_empty']
const NUMBER_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'in',
  'not_in',
  'is_set',
  'is_empty',
]
const DATE_OPERATORS: ConditionOperator[] = ['greater_than', 'greater_than_equal', 'less_than', 'less_than_equal', 'is_set', 'is_empty']
const CHOICE_OPERATORS: ConditionOperator[] = ['equals', 'not_equals', 'in', 'not_in', 'is_set', 'is_empty']
const COUNT_OPERATORS: ConditionOperator[] = ['greater_than_equal', 'greater_than', 'less_than', 'less_than_equal', 'equals', 'is_set', 'is_empty']
const ALL_OPERATORS: ConditionOperator[] = [
  'equals',
  'not_equals',
  'contains',
  'like',
  'in',
  'not_in',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'is_set',
  'is_empty',
]

const isOperator = (value: string): value is ConditionOperator => (VISIBILITY_OPERATORS as readonly string[]).includes(value)

/** The operators a field offers, in the order the select shows them. */
export function operatorsFor(field: ConditionFieldOption | undefined): ConditionOperator[] {
  if (!field?.type) return field?.count ? COUNT_OPERATORS : ALL_OPERATORS
  if (field.count) return COUNT_OPERATORS
  if (field.type === 'checkbox') return ['equals']
  if (field.type === 'number') return NUMBER_OPERATORS
  if (field.type === 'date') return DATE_OPERATORS
  if (CHOICE_TYPES.has(field.type) || DOCUMENT_TYPES.has(field.type)) return CHOICE_OPERATORS
  if (TEXT_TYPES.has(field.type)) return TEXT_OPERATORS
  return ALL_OPERATORS
}

const LABELS: Record<ConditionOperator, string> = {
  is_set: 'is set',
  is_empty: 'is empty',
  equals: 'is',
  not_equals: 'is not',
  in: 'is any of',
  not_in: 'is none of',
  greater_than: 'is greater than',
  greater_than_equal: 'is at least',
  less_than: 'is less than',
  less_than_equal: 'is at most',
  like: 'has all the words',
  contains: 'contains',
}
const DATE_LABELS: Partial<Record<ConditionOperator, string>> = {
  greater_than: 'is after',
  greater_than_equal: 'is on or after',
  less_than: 'is before',
  less_than_equal: 'is on or before',
}
const COUNT_LABELS: Partial<Record<ConditionOperator, string>> = {
  is_set: 'has items',
  is_empty: 'has no items',
  equals: 'has exactly',
  not_equals: 'does not have exactly',
  greater_than: 'has more than',
  greater_than_equal: 'has at least',
  less_than: 'has fewer than',
  less_than_equal: 'has at most',
}
/** A field with many values (hasMany) includes a value rather than being it. */
const MANY_LABELS: Partial<Record<ConditionOperator, string>> = {
  equals: 'includes',
  not_equals: 'does not include',
  in: 'includes any of',
  not_in: 'includes none of',
}

/** The plain-language label of an operator for a field: "is", "is after", "has at least", "includes". */
export function operatorLabel(operator: string, field: ConditionFieldOption | undefined): string {
  if (!isOperator(operator)) return operator
  if (field?.count) return COUNT_LABELS[operator] ?? LABELS[operator]
  if (field?.type === 'date') return DATE_LABELS[operator] ?? LABELS[operator]
  if (field?.hasMany) return MANY_LABELS[operator] ?? LABELS[operator]
  return LABELS[operator]
}

/** The operator select's options for a row: the field's operators, plus the row's own when it is not one of them. */
export function operatorOptions(field: ConditionFieldOption | undefined, current: string): Array<{ value: string; label: string }> {
  const list: string[] = operatorsFor(field)
  const all = current && !list.includes(current) ? [current, ...list] : list
  return all.map((value) => ({ value, label: operatorLabel(value, field) }))
}

/** The fixed value input of a row. `multiple`: the operator takes a list (`in`, `not_in`). */
export type ValueInput = {
  kind: 'none' | 'checkbox' | 'number' | 'date' | 'options' | 'documents' | 'text'
  multiple: boolean
}

/** The fixed value input of a row, from the field's Payload type and the operator. */
export function valueInputOf(field: ConditionFieldOption | undefined, operator: string): ValueInput {
  if (VALUELESS_OPERATORS.has(operator as ConditionOperator)) return { kind: 'none', multiple: false }
  const multiple = LIST_OPERATORS.has(operator as ConditionOperator)
  if (field?.count) return { kind: multiple ? 'text' : 'number', multiple }
  switch (field?.type) {
    case 'checkbox':
      return { kind: 'checkbox', multiple: false }
    case 'number':
      return { kind: multiple ? 'text' : 'number', multiple }
    case 'date':
      return { kind: multiple ? 'text' : 'date', multiple }
    case 'select':
    case 'radio':
      return { kind: field.options?.length ? 'options' : 'text', multiple }
    case 'relationship':
    case 'upload':
      // A polymorphic field's values name their collection: typed as ids.
      return { kind: typeof field.relationTo === 'string' ? 'documents' : 'text', multiple }
    default:
      return { kind: 'text', multiple }
  }
}

/** The group a field type compares with: a value of one kind fits a field of the same kind. */
function kindOf(field: ConditionFieldOption): string | null {
  if (field.count) return 'number'
  if (!field.type) return null
  if (TEXT_TYPES.has(field.type) || CHOICE_TYPES.has(field.type)) return 'text'
  if (DOCUMENT_TYPES.has(field.type)) return `documents:${JSON.stringify(field.relationTo ?? null)}`
  return field.type
}

/**
 * The candidates a row's value can come from: fields of the same kind (any when a type is
 * unknown), each path once. `exceptSelf`: leave out the row's own field (another field of the
 * same document).
 */
export function compatibleFields(
  field: ConditionFieldOption | undefined,
  candidates: readonly ConditionFieldOption[],
  exceptSelf = false,
): ConditionFieldOption[] {
  const kind = field ? kindOf(field) : null
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.count ? '#' : ''}${candidate.path}`
    if (seen.has(key)) return false
    seen.add(key)
    if (exceptSelf && field && candidate.path === field.path && Boolean(candidate.count) === Boolean(field.count)) return false
    const other = kindOf(candidate)
    return kind === null || other === null || other === kind
  })
}

/** The value sources a row offers: a fixed value first, then the caller's sources that fit the field. */
export function rowSources(field: ConditionFieldOption | undefined, operator: string, sources: ConditionSources = {}): ValueSource[] {
  if (VALUELESS_OPERATORS.has(operator as ConditionOperator)) return []
  const out: ValueSource[] = ['fixed']
  if (sources.date && field?.type === 'date' && !field.count && !LIST_OPERATORS.has(operator as ConditionOperator)) out.push('date')
  if (sources.page && compatibleFields(field, sources.page).length > 0) out.push('page')
  if (sources.query) out.push('query')
  if (sources.field && compatibleFields(field, sources.field, true).length > 0) out.push('field')
  return out
}

/** Where the row's value comes from. A token the caller does not offer counts as a fixed value. */
export function rowSource(row: Pick<ConditionRow, 'value' | 'valueField'>, sources: ConditionSources = {}): ValueSource {
  if (row.valueField !== undefined && sources.field) return 'field'
  if (sources.date && parseDateToken(row.value)) return 'date'
  if (sources.page && pageTokenPath(row.value) !== null) return 'page'
  if (sources.query && queryTokenParam(row.value) !== null) return 'query'
  return 'fixed'
}

/** The last segment of a path, as a URL parameter name: `category.slug` -> `slug`. */
const paramOf = (path: string) => (path.split('.').filter((part) => !part.startsWith('$')).at(-1) ?? '').replace(/[^\w-]/g, '')

/** The row with its value taken from another source, with a starting value for that source. */
export function withSource(
  row: ConditionRow,
  source: ValueSource,
  field: ConditionFieldOption | undefined,
  sources: ConditionSources = {},
): ConditionRow {
  const { valueField: _valueField, ...rest } = row
  switch (source) {
    case 'date':
      return { ...rest, value: '$now-7d', text: '' }
    case 'page': {
      const first = compatibleFields(field, sources.page ?? [])[0]
      return { ...rest, value: pageToken(first?.path ?? ''), text: '' }
    }
    case 'query':
      return { ...rest, value: queryToken(paramOf(row.field)), text: '' }
    case 'field': {
      const first = compatibleFields(field, sources.field ?? [], true)[0]
      return { ...rest, value: undefined, text: '', valueField: first?.path ?? '' }
    }
    default: {
      const value = LIST_OPERATORS.has(row.operator as ConditionOperator) ? [] : field?.type === 'checkbox' ? true : ''
      return { ...rest, value, text: '' }
    }
  }
}

/** The fixed value a row keeps for a new operator, re-read from its value for that operator. */
function convertValue(row: ConditionRow, operator: string, field: ConditionFieldOption | undefined): unknown {
  if (VALUELESS_OPERATORS.has(operator as ConditionOperator)) return undefined
  const type = field?.count ? 'number' : field?.type
  if (type === 'checkbox') return row.value !== false
  // Ids of documents are not text: keep them, as a list or as the first one.
  if (type === 'relationship' || type === 'upload') {
    const list = Array.isArray(row.value) ? row.value : row.value === undefined || row.value === '' ? [] : [row.value]
    return LIST_OPERATORS.has(operator as ConditionOperator) ? list : (list[0] ?? '')
  }
  return parseWhereValue(whereValueText(row.value), operator, type)
}

/** The row after the user picks another field: an operator the field offers, and a value that fits it. */
export function withField(row: ConditionRow, picked: ConditionFieldOption | undefined, path: string): ConditionRow {
  const next: ConditionRow = { ...row, field: picked?.path ?? path, count: picked?.count === true }
  if (!next.count) delete next.count
  const operators: string[] = operatorsFor(picked)
  const operator = operators.includes(row.operator) ? row.operator : operators[0]!
  if (row.valueField !== undefined || pageTokenPath(row.value) !== null || queryTokenParam(row.value) !== null || parseDateToken(row.value)) {
    // A value from another source may not fit the new field: start again with a fixed value.
    return withSource({ ...next, operator }, 'fixed', picked)
  }
  const value = convertValue(next, operator, picked)
  return { ...next, operator, value, text: whereValueText(value) }
}

/** The row after the user picks another operator. A value from another source stays when it still fits. */
export function withOperator(row: ConditionRow, operator: string, field: ConditionFieldOption | undefined, sources: ConditionSources = {}): ConditionRow {
  const source = rowSource(row, sources)
  if (VALUELESS_OPERATORS.has(operator as ConditionOperator)) {
    const { valueField: _valueField, ...rest } = row
    return { ...rest, operator, value: undefined, text: '' }
  }
  if (source !== 'fixed') {
    const next = { ...row, operator }
    return rowSources(field, operator, sources).includes(source) ? next : withSource(next, 'fixed', field, sources)
  }
  const value = convertValue(row, operator, field)
  return { ...row, operator, value, text: whereValueText(value) }
}

/** The relative date choices: "now", or days or hours ago or from now. */
export const RELATIVE_DATE_OPTIONS = [
  { value: 'now', label: 'now' },
  { value: 'd-', label: 'days ago' },
  { value: 'd+', label: 'days from now' },
  { value: 'h-', label: 'hours ago' },
  { value: 'h+', label: 'hours from now' },
]

/** The relative date select's value of a date: "now", "d-", "d+", "h-" or "h+". */
export const relativeDateKey = (date: RelativeDate): string => (date.amount === 0 ? 'now' : `${date.unit}${date.direction < 0 ? '-' : '+'}`)

/** The date token after a change of the amount or the choice. Picking days or hours from "now" starts at 7. */
export function changeRelativeDate(date: RelativeDate, change: { amount?: number; key?: string }): string {
  if (change.key === 'now') return dateToken({ ...date, amount: 0 })
  if (change.key) {
    const unit = change.key[0] === 'h' ? 'h' : 'd'
    return dateToken({ amount: date.amount || 7, unit, direction: change.key[1] === '-' ? -1 : 1 })
  }
  return dateToken({ ...date, amount: change.amount ?? date.amount })
}

/** A relative date in words: "now", "30 days ago", "1 hour from now". */
export function relativeDateText(date: RelativeDate): string {
  if (date.amount === 0) return 'now'
  const unit = date.unit === 'h' ? 'hour' : 'day'
  return `${date.amount} ${unit}${date.amount === 1 ? '' : 's'} ${date.direction < 0 ? 'ago' : 'from now'}`
}

/** A row's value in words, for the summary. */
function valueText(row: ConditionRow, field: ConditionFieldOption | undefined, fields: readonly ConditionFieldOption[], sources: ConditionSources): string {
  const source = rowSource(row, sources)
  const labelOf = (path: string, list: readonly ConditionFieldOption[]) => list.find((f) => f.path === path && !f.count)?.label ?? path
  if (source === 'field') return labelOf(row.valueField ?? '', sources.field ?? fields)
  if (source === 'page') return `the page's ${labelOf(pageTokenPath(row.value) ?? '', sources.page ?? [])}`
  if (source === 'query') return `?${queryTokenParam(row.value) ?? ''}`
  const date = parseDateToken(row.value)
  if (source === 'date' && date) return relativeDateText(date)
  if (typeof row.value === 'boolean') return field?.type === 'checkbox' ? (row.value ? 'checked' : 'not checked') : String(row.value)
  const values = Array.isArray(row.value) ? row.value : [row.value]
  if (field?.type === 'relationship' || field?.type === 'upload') return values.length === 1 ? 'a chosen document' : `${values.length} chosen documents`
  const optionLabel = (value: unknown) => field?.options?.find((o) => o.value === value)?.label ?? String(value ?? '')
  return values.map(optionLabel).join(', ')
}

/**
 * The conditions in one line: "Price is greater than 100 and Tags is any of new, sale, or
 * Featured is checked". Rows without a field are left out. Empty for none.
 */
export function conditionSummary(groups: readonly ConditionRow[][], fields: readonly ConditionFieldOption[], sources: ConditionSources = {}): string {
  const parts = groups
    .map((group) =>
      group
        .filter((row) => row.field.trim())
        .map((row) => {
          const field = fields.find((f) => f.path === row.field && Boolean(f.count) === Boolean(row.count))
          const name = field?.label ?? row.field
          const operator = operatorLabel(row.operator, field ?? (row.count ? { path: row.field, label: name, count: true } : undefined))
          if (VALUELESS_OPERATORS.has(row.operator as ConditionOperator)) return `${name} ${operator}`
          const value = valueText(row, field, fields, sources)
          return `${name} ${operator} ${value}${row.count ? ' items' : ''}`
        })
        .join(' and '),
    )
    .filter(Boolean)
  return parts.join(', or ')
}
