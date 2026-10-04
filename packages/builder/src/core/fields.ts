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
