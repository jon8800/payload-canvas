// Internal helpers for reading Payload field configs as plain data.
// Payload's `Field` union is large; this module reads it through a loose shape so the
// schema generator and the validator share one view of "which fields hold data".

import { isPlainObject } from './tree'

export type LooseField = {
  type: string
  name?: string
  label?: unknown
  required?: boolean
  hasMany?: boolean
  virtual?: unknown
  options?: unknown[]
  relationTo?: string | string[]
  fields?: unknown[]
  tabs?: unknown[]
  blocks?: unknown[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  minRows?: number
  maxRows?: number
  defaultValue?: unknown
  jsonSchema?: { schema?: unknown }
  admin?: { description?: unknown; custom?: Record<string, unknown> }
  custom?: { ai?: { description?: unknown } }
  ai?: { description?: unknown }
}

/** A field that stores a value under `name`. */
export type DataField = LooseField & { name: string }

/** A block of a Payload `blocks` field, as plain data. */
export type LooseBlock = { slug: string; fields: unknown[]; labels?: unknown }

function asField(value: unknown): LooseField | null {
  return isPlainObject(value) && typeof value.type === 'string' ? (value as LooseField) : null
}

/**
 * Fields that hold data, in order. Rows, collapsibles, unnamed groups and unnamed tabs are
 * flattened into their parent. Named tabs come back as `group` fields. UI, join and virtual
 * fields are skipped because they store nothing.
 */
export function dataFields(fields: readonly unknown[] | undefined): DataField[] {
  const out: DataField[] = []
  for (const raw of fields ?? []) {
    const field = asField(raw)
    if (!field) continue
    if (field.type === 'ui' || field.type === 'join' || field.virtual) continue
    if (field.type === 'row' || field.type === 'collapsible' || (field.type === 'group' && !field.name)) {
      out.push(...dataFields(field.fields))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        if (!isPlainObject(tab)) continue
        const tabFields = Array.isArray(tab.fields) ? tab.fields : []
        if (typeof tab.name === 'string' && tab.name) {
          out.push({ ...(tab as Omit<LooseField, 'type'>), type: 'group', name: tab.name, fields: tabFields })
        } else {
          out.push(...dataFields(tabFields))
        }
      }
      continue
    }
    if (typeof field.name === 'string' && field.name) out.push(field as DataField)
  }
  return out
}

/** A `defaultValue` that is plain data (function defaults run only in Payload's own operations). */
export function hasStaticDefault(field: { defaultValue?: unknown }): boolean {
  return field.defaultValue !== undefined && typeof field.defaultValue !== 'function'
}

/** Allowed values of a select or radio field. Options are strings or `{ label, value }`. */
export function optionValues(field: LooseField): string[] {
  const values: string[] = []
  for (const option of field.options ?? []) {
    if (typeof option === 'string') values.push(option)
    else if (isPlainObject(option) && typeof option.value === 'string') values.push(option.value)
  }
  return values
}

/** Blocks of a Payload `blocks` field. Block references (plain slugs) are skipped. */
export function fieldBlocks(field: LooseField): LooseBlock[] {
  return (field.blocks ?? []).filter(
    (b): b is LooseBlock => isPlainObject(b) && typeof b.slug === 'string' && Array.isArray(b.fields),
  )
}

/** A label or description as text. Localized objects use "en" or the first string. */
export function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined
  if (!isPlainObject(value)) return undefined
  if (typeof value.en === 'string') return value.en
  return Object.values(value).find((v): v is string => typeof v === 'string')
}

/**
 * The field a prop path points at: "text", "link.url" (inside a group), "items.2.text" (a field of
 * an array row) or "photos.1" (one value of a `hasMany` field). Undefined when the path does not
 * follow the fields. A path that stops at an array (no row number) returns the array field.
 */
export function fieldAtPropPath(fields: readonly unknown[] | undefined, path: string): DataField | undefined {
  let list: readonly unknown[] | undefined = fields
  let found: DataField | undefined
  // 'value': the path picked one value of a hasMany field, so nothing may follow.
  let step: 'name' | 'value' = 'name'
  let needsRow = false
  for (const segment of path.split('.')) {
    if (/^\d+$/.test(segment)) {
      if (!found || step === 'value') return undefined
      if (needsRow) {
        needsRow = false
        continue
      }
      if (!found.hasMany) return undefined
      step = 'value'
      continue
    }
    if (step === 'value' || needsRow) return undefined
    found = dataFields(list).find((f) => f.name === segment)
    if (!found) return undefined
    list = found.fields
    needsRow = found.type === 'array'
  }
  return found
}
