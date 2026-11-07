// The where builder's rows (field, operator, value) <-> a Payload `where` object, and the value
// parsing the condition rows share (ConditionRows.tsx). Pure, so it is tested without React.
// Rows in a group are AND-ed and groups are OR-ed: `{ or: [{ and: [...] }, ...] }`. The rows use
// the visibility operator names: Payload's `exists: true` / `exists: false` are "is set" and
// "is empty". A where the rows cannot show (nested groups, an `or` next to fields, object
// values, unknown operators) returns null from `whereGroups`, and the field shows raw JSON, so
// no part of a stored where is ever lost.

import type { VisibilityOperator } from '../../../core/visibility'
import { pageTokenPath, queryTokenParam } from '../../../core/whereValues'

/** One condition. `value` is the stored value (a string, number, boolean, or a list for in/not_in). */
export type WhereRow = { field: string; operator: VisibilityOperator | (string & {}); value: unknown }

/** Payload where operators the rows show (with `exists` as is_set / is_empty). */
const ROW_OPERATORS = new Set([
  'equals',
  'not_equals',
  'in',
  'not_in',
  'greater_than',
  'greater_than_equal',
  'less_than',
  'less_than_equal',
  'like',
  'contains',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isScalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

/** A value read when the query runs (`$page.<path>`, `$query.<param>`): a list for in/not_in too. */
const isListToken = (value: unknown) => pageTokenPath(value) !== null || queryTokenParam(value) !== null

/** The row of one `{ op: value }` entry, or null when the rows cannot show it. */
function rowOf(field: string, operator: string, value: unknown): WhereRow | null {
  if (operator === 'exists') return typeof value === 'boolean' ? { field, operator: value ? 'is_set' : 'is_empty', value: undefined } : null
  if (!ROW_OPERATORS.has(operator)) return null
  if (operator === 'in' || operator === 'not_in') {
    return (Array.isArray(value) && value.every(isScalar)) || isListToken(value) ? { field, operator, value } : null
  }
  return isScalar(value) ? { field, operator, value } : null
}

/** The rows of `{ field: { op: value } }` (several fields and operators allowed). Null when it does not fit. */
function rowsOf(where: Record<string, unknown>): WhereRow[] | null {
  const rows: WhereRow[] = []
  for (const [field, condition] of Object.entries(where)) {
    if (field === 'and' || field === 'or' || !isRecord(condition)) return null
    const entries = Object.entries(condition)
    if (entries.length === 0) return null
    for (const [operator, value] of entries) {
      const row = rowOf(field, operator, value)
      if (!row) return null
      rows.push(row)
    }
  }
  return rows
}

/** The rows of one AND group: `{ a: …, b: … }` or `{ and: [ { a: … }, … ] }`. Null when it does not fit. */
function groupRows(where: Record<string, unknown>): WhereRow[] | null {
  const keys = Object.keys(where)
  if (keys.length !== 1 || keys[0] !== 'and') return rowsOf(where)
  if (!Array.isArray(where.and)) return null
  const rows: WhereRow[] = []
  for (const part of where.and) {
    if (!isRecord(part)) return null
    const partRows = rowsOf(part)
    if (!partRows) return null
    rows.push(...partRows)
  }
  return rows
}

/**
 * The groups of a stored where: none for no where, null when the builder cannot show it. Takes
 * one group (`{ a: { equals: 1 }, b: … }` or `{ and: [...] }`) or `{ or: [group, …] }`.
 */
export function whereGroups(where: unknown): WhereRow[][] | null {
  if (where === undefined || where === null) return []
  if (!isRecord(where)) return null
  const keys = Object.keys(where)
  if (keys.length === 1 && keys[0] === 'or') {
    if (!Array.isArray(where.or) || where.or.length === 0) return null
    const groups: WhereRow[][] = []
    for (const part of where.or) {
      if (!isRecord(part)) return null
      const rows = groupRows(part)
      // An empty part matches every document: the rows have no way to show that.
      if (!rows || rows.length === 0) return null
      groups.push(rows)
    }
    return groups
  }
  const rows = groupRows(where)
  if (!rows) return null
  return rows.length > 0 ? [rows] : []
}

/** The stored `{ op: value }` of a row: is_set and is_empty become `exists`. */
function entryOf(row: WhereRow): [string, unknown] {
  if (row.operator === 'is_set') return ['exists', true]
  if (row.operator === 'is_empty') return ['exists', false]
  return [row.operator, row.value]
}

/**
 * The where of one group: one object `{ field: { op: value } }`, or `{ and: [...] }` when a
 * field has the same operator twice. Rows without a field are left out. `undefined` for no rows.
 */
export function rowsWhere(rows: readonly WhereRow[]): Record<string, unknown> | undefined {
  const complete = rows.filter((row) => row.field.trim())
  if (complete.length === 0) return undefined
  const flat: Record<string, Record<string, unknown>> = {}
  for (const row of complete) {
    const field = row.field.trim()
    const condition = (flat[field] ??= {})
    const [operator, value] = entryOf(row)
    if (operator in condition) {
      return { and: complete.map((r) => ({ [r.field.trim()]: Object.fromEntries([entryOf(r)]) })) }
    }
    condition[operator] = value
  }
  return flat
}

/** The where of the groups: one group as `rowsWhere`, several as `{ or: [...] }`. Empty groups are left out. */
export function groupsWhere(groups: readonly WhereRow[][]): Record<string, unknown> | undefined {
  const wheres = groups.map(rowsWhere).filter((where): where is Record<string, unknown> => where !== undefined)
  if (wheres.length === 0) return undefined
  return wheres.length === 1 ? wheres[0] : { or: wheres }
}

/** The text a value shows in the value input: lists as "a, b". */
export const whereValueText = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(', ') : value === undefined || value === null ? '' : String(value)

/**
 * The value to store for typed text. `fieldType` is the Payload field type when known: numbers
 * become numbers and checkboxes booleans; any other text stays text (so "0412" stays a string).
 * `in` and `not_in` split on commas. `is_set` and `is_empty` take no value.
 */
export function parseWhereValue(text: string, operator: string, fieldType?: string): unknown {
  if (operator === 'is_set' || operator === 'is_empty') return undefined
  if (operator === 'exists') return text.trim() !== 'false'
  const one = (part: string): unknown => {
    if (fieldType === 'number') {
      const number = Number(part)
      return part.trim() !== '' && Number.isFinite(number) ? number : part
    }
    if (fieldType === 'checkbox') return part.trim() === 'true'
    return part
  }
  if (operator === 'in' || operator === 'not_in') {
    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(one)
  }
  return one(text)
}
