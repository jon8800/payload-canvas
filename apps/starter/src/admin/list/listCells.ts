import type { CollectionConfig, Field, Plugin } from 'payload'

import { setAdminComponent, walkFields } from '../fields/walkFields'

const FIELD_CELL = '/admin/list/FieldCell#FieldCell'

/** Field types whose stock list cell shows a raw value (code text, JSON, `[upload]` markers). */
const CELL_TYPES = new Set(['checkbox', 'select', 'radio', 'date', 'array', 'blocks', 'json', 'richText', 'point', 'email'])

function wantsCell(field: Field): boolean {
  if (CELL_TYPES.has(field.type)) return true
  // Lists of text or numbers show as JSON in the stock cell.
  return (field.type === 'text' || field.type === 'number') && Boolean(field.hasMany)
}

const hasField = (collection: CollectionConfig, name: string) => collection.fields.some((field) => 'name' in field && field.name === name)

type Timestamp = 'updatedAt' | 'createdAt' | 'deletedAt'

/**
 * Payload's own `updatedAt`, `createdAt` and (with trash) `deletedAt` fields, as Payload adds
 * them, plus the list cell. Payload adds these only when the collection has no field of that
 * name, so this copy replaces Payload's and changes nothing else.
 */
function timestampFields(collection: CollectionConfig): Field[] {
  const names: Timestamp[] = [...(collection.timestamps === false ? [] : (['updatedAt', 'createdAt'] as const)), ...(collection.trash ? (['deletedAt'] as const) : [])]
  return names
    .filter((name) => !hasField(collection, name))
    .map((name): Field => ({
      name,
      type: 'date',
      admin: { disableBulkEdit: true, hidden: true, components: { Cell: FIELD_CELL } },
      index: true,
      label: ({ t }) => t(`general:${name}`),
    }))
}

/**
 * Better list cells by field type in every collection (FieldCell.tsx): a check mark for
 * checkboxes, option labels as chips, short dates, "3 links" for arrays and blocks, a JSON
 * summary, and a rich text excerpt. Fields with their own Cell keep it. Run it after the plugins
 * that add collections (and after `statusBadges`), so their lists get the cells too.
 */
export function listCells(): Plugin {
  return (config) => {
    walkFields(config, (field, owner) => {
      if (owner.kind !== 'global' && wantsCell(field)) setAdminComponent(field, 'Cell', FIELD_CELL)
    })
    return {
      ...config,
      collections: config.collections?.map((collection) => {
        const timestamps = timestampFields(collection)
        return timestamps.length ? { ...collection, fields: [...collection.fields, ...timestamps] } : collection
      }),
    }
  }
}
