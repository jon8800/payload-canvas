// Pure helpers for the array field: row ids, moves, duplicates and the key of the collapse state.
// No React here, so they are unit tested.

import { isRecord } from './values'

export type ArrayRow = Record<string, unknown> & { id: string }

/**
 * The rows of an array value, each with a unique id. Rows written by hand (seed data, AI) may have
 * no id, or a repeated one: they get `idFor(index, taken)`. Rows that already have a unique id keep
 * their object, so memoized rows skip the render. Items that are not objects are dropped.
 */
export function withRowIds(value: unknown, idFor: (index: number, taken: ReadonlySet<string>) => string): ArrayRow[] {
  const items = Array.isArray(value) ? value.filter(isRecord) : []
  const taken = new Set<string>()
  const own = items.map((row) => {
    if (typeof row.id !== 'string' || row.id === '' || taken.has(row.id)) return null
    taken.add(row.id)
    return row.id
  })
  return items.map((row, index) => {
    if (own[index] !== null) return row as ArrayRow
    const id = idFor(index, taken)
    taken.add(id)
    return { ...row, id }
  })
}

/** The list with one item moved from `from` to `to` (its final index). The same list when nothing moves. */
export function moveItem<T>(list: readonly T[], from: number, to: number): readonly T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item as T)
  return next
}

/** The set with `id` added (`on`) or removed. The same set when nothing changes. */
export function toggleId(set: ReadonlySet<string>, id: string, on: boolean): ReadonlySet<string> {
  if (set.has(id) === on) return set
  const next = new Set(set)
  if (on) next.add(id)
  else next.delete(id)
  return next
}

/** The row of a parent array field: its index path and its stable key. */
export type ParentRow = { rowPath: string; rowKey: string }

/**
 * The key under which an array field stores which rows are collapsed. A top-level array uses its
 * path (`builder.<blockId>.<field>`). A nested array uses its parent row's id instead of the
 * index, so the state follows the row when the parent array is reordered.
 */
export function arrayStateKey(path: string, parent: ParentRow | null): string {
  if (!parent || !path.startsWith(`${parent.rowPath}.`)) return path
  return `${parent.rowKey}${path.slice(parent.rowPath.length)}`
}

type FieldLike = { type: string; name?: string; fields?: unknown; tabs?: unknown }

const asFields = (value: unknown): FieldLike[] => (Array.isArray(value) ? (value as FieldLike[]) : [])

/** Gives every row of every nested array field in `data` a new id. Mutates `data`. */
function renewNestedIds(data: Record<string, unknown>, fields: readonly FieldLike[], newId: () => string): void {
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of asFields(field.tabs)) {
        const nested = tab.name ? data[tab.name] : data
        if (isRecord(nested)) renewNestedIds(nested, asFields(tab.fields), newId)
      }
      continue
    }
    const nested = field.name ? data[field.name] : data
    if (field.type === 'array' && Array.isArray(nested)) {
      for (const row of nested) {
        if (!isRecord(row)) continue
        row.id = newId()
        renewNestedIds(row, asFields(field.fields), newId)
      }
    } else if (['group', 'row', 'collapsible'].includes(field.type) && isRecord(nested)) {
      renewNestedIds(nested, asFields(field.fields), newId)
    }
  }
}

/** A deep copy of a row with a new id, and new ids for the rows of its nested array fields. */
export function cloneRow(row: ArrayRow, fields: readonly unknown[], newId: () => string): ArrayRow {
  const copy = structuredClone(row)
  renewNestedIds(copy, fields as FieldLike[], newId)
  return { ...copy, id: newId() }
}

/** "Item 01": Payload's fallback row label, from the singular label and the row number. */
export function fallbackRowLabel(singular: string, index: number): string {
  return `${singular} ${String(index + 1).padStart(2, '0')}`
}
