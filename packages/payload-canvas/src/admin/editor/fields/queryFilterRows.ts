// The URL filter rows (URL parameter, field) <-> a collection list's `queryFilters`. Pure, so it is
// tested without React. A row stores the short form `{ [param]: field }`: the field equals the URL
// value. A value with the full form (`{ [param]: { [value]: where } }`) returns null from
// `queryFilterRows`, and the field shows JSON.

export type QueryFilterRow = { param: string; field: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The rows of stored `queryFilters`: empty for none, null when one param uses the full form. */
export function queryFilterRows(value: unknown): QueryFilterRow[] | null {
  if (value === undefined || value === null) return []
  if (!isRecord(value)) return null
  const rows: QueryFilterRow[] = []
  for (const [param, field] of Object.entries(value)) {
    if (typeof field !== 'string') return null
    rows.push({ param, field })
  }
  return rows
}

/** The `queryFilters` of the rows. Rows without a parameter are left out. `undefined` for none. */
export function rowsQueryFilters(rows: readonly QueryFilterRow[]): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const param = row.param.trim()
    if (param) out[param] = row.field.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}
