// Pure: which required fields are empty while their conditions show them. The settings panel of a
// panel region (RegionFields) holds a change back until they are filled, because Payload refuses
// the save otherwise: choosing "Redirect" shows a required "Document to link to".

import { textOf } from '../../../core/fields'
import { isEmptyValue, isFieldVisible, isRecord, type FieldShape } from '../fields/values'

type LooseField = FieldShape & { required?: boolean; label?: unknown; fields?: LooseField[]; tabs?: Array<{ name?: string; fields: LooseField[] }> }

const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

/**
 * The labels of the required fields that show and have no value. `scope`: every field that
 * shares `data` (conditions read sibling defaults from it). Arrays are checked row by row.
 */
export function missingRequired(fields: readonly LooseField[], data: unknown, scope: readonly LooseField[] = fields): string[] {
  const record = isRecord(data) ? data : {}
  const out: string[] = []
  for (const field of fields) {
    if (!isFieldVisible(field, record, scope)) continue
    if (field.type === 'row' || field.type === 'collapsible' || (field.type === 'group' && !field.name)) {
      out.push(...missingRequired(field.fields ?? [], record, scope))
      continue
    }
    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) out.push(...(tab.name ? missingRequired(tab.fields, record[tab.name]) : missingRequired(tab.fields, record, scope)))
      continue
    }
    if (!field.name) continue
    const value = record[field.name]
    if (field.type === 'group') {
      out.push(...missingRequired(field.fields ?? [], value))
      continue
    }
    if (field.type === 'array' && Array.isArray(value)) {
      for (const row of value) out.push(...missingRequired(field.fields ?? [], row))
    }
    // A missing value gets the field's default when Payload saves; a cleared one stays empty.
    const effective = value === undefined ? field.defaultValue : value
    if (field.required && field.type !== 'checkbox' && isEmptyValue(effective)) out.push(textOf(field.label) ?? words(field.name))
  }
  return [...new Set(out)]
}
