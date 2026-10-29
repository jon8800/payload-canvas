// A block's visibility conditions <-> the condition rows of the inspector ("or" groups of "and"
// rows), and the fields the rows offer. Pure, so it is tested without React.

import { INDEX_PATH, URL_PATH } from '../../../core/bindings'
import type { BindingField } from '../../../core/types'
import {
  checkVisibility,
  groupsVisibility,
  VALUELESS_OPERATORS,
  visibilityGroups,
  type BlockVisibility,
  type VisibilityCondition,
  type VisibilityOperator,
} from '../../../core/visibility'
import type { ConditionFieldOption, ConditionRow } from '../fields/conditions'
import { whereValueText } from '../fields/whereRows'
import { pickerRows } from './binding'

/** The rows of stored conditions, as groups: rows in a group must all match; one group is enough. */
export function visibilityRows(visibility: BlockVisibility | undefined): ConditionRow[][] {
  return visibilityGroups(visibility).map((group) =>
    group.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      value: condition.value,
      text: whereValueText(condition.value),
      ...(condition.valueField !== undefined ? { valueField: condition.valueField } : {}),
      ...(condition.count ? { count: true } : {}),
    })),
  )
}

/** The condition of a row, or null when it is not complete (no field, a value that does not fit yet). */
function rowCondition(row: ConditionRow): VisibilityCondition | null {
  if (!row.field.trim()) return null
  const valueless = VALUELESS_OPERATORS.has(row.operator as VisibilityOperator)
  const raw = {
    field: row.field,
    operator: row.operator,
    ...(row.count ? { count: true } : {}),
    ...(valueless ? {} : row.valueField !== undefined ? { valueField: row.valueField } : { value: row.value }),
  }
  const checked = checkVisibility({ conditions: [raw] })
  return checked && typeof checked !== 'string' ? (checked.conditions[0] as VisibilityCondition) : null
}

/**
 * The visibility of the row groups, or null for none. Rows without a field are left out, and so
 * is a row whose value does not fit its operator yet (an empty list while typing).
 */
export function rowsVisibility(groups: readonly ConditionRow[][]): BlockVisibility | null {
  const conditions = groups.map((group) => group.flatMap((row) => rowCondition(row) ?? []))
  return groupsVisibility(conditions) ?? null
}

/** Field types with many values: a condition can count them. */
const isList = (field: BindingField) => field.type === 'array' || field.hasMany === true

/** The condition field of a binding field: its type, and its options and collection for the value input. */
function fieldOption(field: BindingField, label: string): ConditionFieldOption {
  const out: ConditionFieldOption = { path: field.path, label, type: field.type }
  if (field.hasMany) out.hasMany = true
  if (field.relationTo !== undefined) out.relationTo = field.relationTo
  if (field.options) out.options = field.options
  return out
}

/**
 * The fields a visibility row offers in a binding scope: every field the binding picker shows
 * (groups and one relationship hop walked, `$url` left out), the item number inside lists and
 * repeats, and the number of items of arrays and hasMany fields (`count`, labelled with the
 * field's own label: the operators say "has at least").
 */
export function visibilityFields(fields: BindingField[], inItem: boolean): ConditionFieldOption[] {
  const out: ConditionFieldOption[] = []
  if (inItem && !fields.some((f) => f.path === INDEX_PATH)) out.push({ path: INDEX_PATH, label: 'Item number', type: 'number' })
  for (const row of pickerRows(fields, (field) => field.path !== URL_PATH && field.type !== 'group')) {
    if (!row.selectable) continue
    const label = row.trail.join(' › ')
    if (!isList(row.field) || row.field.type !== 'array') out.push(fieldOption(row.field, label))
    if (isList(row.field)) out.push({ path: row.field.path, label, type: 'number', count: true })
  }
  return out
}

/**
 * The page fields a collection list's `where` row can take its value from (`$page.<path>`): the
 * template collection's fields, and "This page" (its id) for rows that point to that collection.
 */
export function pageConditionFields(fields: BindingField[], collection: string): ConditionFieldOption[] {
  return [
    { path: 'id', label: 'This page', type: 'relationship', relationTo: collection },
    ...visibilityFields(fields, false).filter((field) => !field.count && field.path !== 'id'),
  ]
}
