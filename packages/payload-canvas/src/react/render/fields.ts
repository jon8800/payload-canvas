// Walks block props along their Payload field configs. Used to load documents (resolve.ts) and
// to resolve link groups (RenderLayout).

export type FieldLike = {
  type?: string
  name?: string
  relationTo?: string | string[]
  hasMany?: boolean
  fields?: FieldLike[]
  tabs?: Array<{ name?: string; fields?: FieldLike[] }>
  blocks?: Array<{ slug?: string; fields?: FieldLike[] } | string>
  admin?: { custom?: Record<string, unknown> }
}

export type PropsRecord = Record<string, unknown>

/**
 * Called for every named field that has a value. Return the value unchanged to let the walker go
 * into groups, arrays and blocks fields. Return a new value to replace it (the walker stops there).
 */
export type VisitField = (field: FieldLike, value: unknown) => unknown

export const isRecord = (value: unknown): value is PropsRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Maps every row of an array or blocks field. Keeps the array when no row changes. */
function mapRows(value: unknown, fieldsOf: (row: PropsRecord) => FieldLike[] | undefined, visit: VisitField): unknown {
  if (!Array.isArray(value)) return value
  const rows = value.map((row) => {
    if (!isRecord(row)) return row
    const fields = fieldsOf(row)
    return fields ? mapFieldValues(row, fields, visit) : row
  })
  return rows.some((row, i) => row !== value[i]) ? rows : value
}

/**
 * Returns `props` with `visit` applied to every field value, at any depth. Never mutates. Returns
 * the same object when nothing changes. Fields without a name (row, collapsible, unnamed tabs)
 * share the parent object.
 */
export function mapFieldValues(props: PropsRecord, fields: FieldLike[], visit: VisitField): PropsRecord {
  let result = props
  const set = (key: string, value: unknown) => {
    if (value === result[key]) return
    if (result === props) result = { ...props }
    result[key] = value
  }
  for (const field of fields) {
    if (field.type === 'tabs') {
      for (const tab of field.tabs ?? []) {
        if (!tab.name) {
          result = mapFieldValues(result, tab.fields ?? [], visit)
          continue
        }
        const nested = result[tab.name]
        if (isRecord(nested)) set(tab.name, mapFieldValues(nested, tab.fields ?? [], visit))
      }
      continue
    }
    const name = field.name
    if (!name) {
      if (field.fields) result = mapFieldValues(result, field.fields, visit)
      continue
    }
    if (!(name in result)) continue
    const value = result[name]
    const visited = visit(field, value)
    if (visited !== value) {
      set(name, visited)
      continue
    }
    if (field.type === 'group' && isRecord(value)) {
      set(name, mapFieldValues(value, field.fields ?? [], visit))
    } else if (field.type === 'array') {
      set(name, mapRows(value, () => field.fields ?? [], visit))
    } else if (field.type === 'blocks') {
      const variants = (field.blocks ?? []).filter((b) => typeof b === 'object')
      set(name, mapRows(value, (row) => variants.find((b) => b.slug === row.blockType)?.fields, visit))
    }
  }
  return result
}
