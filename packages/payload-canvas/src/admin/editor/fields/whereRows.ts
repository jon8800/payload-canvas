// The where builder's rows (field, operator, value) <-> a Payload `where` object. Pure, so it is
// tested without React. Rows are AND-ed. A where the rows cannot show (`or`, nested groups,
// object values, unknown operators) returns null from `whereRows`, and the field shows raw JSON.

export const WHERE_OPERATORS = [
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
  'exists',
] as const

export type WhereOperator = (typeof WHERE_OPERATORS)[number]

/** One condition. `value` is the stored value (a string, number, boolean, or a list for in/not_in). */
export type WhereRow = { field: string; operator: WhereOperator; value: unknown }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isScalar = (value: unknown) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'

const isOperator = (value: string): value is WhereOperator => (WHERE_OPERATORS as readonly string[]).includes(value)

function fitsOperator(operator: WhereOperator, value: unknown): boolean {
  if (operator === 'exists') return typeof value === 'boolean'
  if (operator === 'in' || operator === 'not_in') return Array.isArray(value) && value.every(isScalar)
  return isScalar(value)
}

/** The rows of `{ field: { op: value } }` (several fields and operators allowed). Null when it does not fit. */
function rowsOf(where: Record<string, unknown>): WhereRow[] | null {
  const rows: WhereRow[] = []
  for (const [field, condition] of Object.entries(where)) {
    if (field === 'and' || field === 'or' || !isRecord(condition)) return null
    const entries = Object.entries(condition)
    if (entries.length === 0) return null
    for (const [operator, value] of entries) {
      if (!isOperator(operator) || !fitsOperator(operator, value)) return null
      rows.push({ field, operator, value })
    }
  }
  return rows
}

/**
 * The rows of a stored where: empty for no where, null when the builder cannot show it. Takes
 * `{ a: { equals: 1 }, b: { … } }` and `{ and: [ { a: { equals: 1 } }, … ] }`.
 */
export function whereRows(where: unknown): WhereRow[] | null {
  if (where === undefined || where === null) return []
  if (!isRecord(where)) return null
  const keys = Object.keys(where)
  if (keys.length === 1 && keys[0] === 'and') {
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
  return rowsOf(where)
}

/**
 * The where of the rows: one object `{ field: { op: value } }`, or `{ and: [...] }` when a field
 * has the same operator twice. Rows without a field are left out. `undefined` for no rows.
 */
export function rowsWhere(rows: readonly WhereRow[]): Record<string, unknown> | undefined {
  const complete = rows.filter((row) => row.field.trim())
  if (complete.length === 0) return undefined
  const flat: Record<string, Record<string, unknown>> = {}
  for (const row of complete) {
    const field = row.field.trim()
    const condition = (flat[field] ??= {})
    if (row.operator in condition) {
      return { and: complete.map((r) => ({ [r.field.trim()]: { [r.operator]: r.value } })) }
    }
    condition[row.operator] = row.value
  }
  return flat
}

/** The text a value shows in the value input: lists as "a, b". */
export const whereValueText = (value: unknown): string =>
  Array.isArray(value) ? value.map(String).join(', ') : value === undefined || value === null ? '' : String(value)

/**
 * The value to store for typed text. `fieldType` is the Payload field type when known: numbers
 * become numbers and checkboxes booleans; any other text stays text (so "0412" stays a string).
 * `in` and `not_in` split on commas. `exists` takes "true" or "false".
 */
export function parseWhereValue(text: string, operator: WhereOperator, fieldType?: string): unknown {
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

/** The value a row keeps when its operator changes: re-read from its text for the new operator. */
export const convertWhereValue = (row: WhereRow, operator: WhereOperator, fieldType?: string): unknown =>
  parseWhereValue(operator === 'exists' ? 'true' : whereValueText(row.value), operator, fieldType)
