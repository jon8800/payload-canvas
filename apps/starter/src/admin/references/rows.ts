// Pure parts of the reference index: which rows one document should have, and what changes.

export type Ref = { relationTo: string; value: string | number }

/** What one document points at: in its published version, in its latest version, and in its layout. */
export type SourceRefs = {
  /** References of the published (main) document. `null` keeps what the index has: a draft save does not change it. */
  published: readonly Ref[] | null
  latest: readonly Ref[]
  /** References that come from the builder layout of the latest version: links the "Broken links" widget checks. */
  layout: readonly Ref[]
}

/** One index row as stored. */
export type StoredRow = { id: string | number; relationTo: string; value: string; published?: boolean | null; latest?: boolean | null; layout?: boolean | null }

/** The flags of one row. */
export type RowFlags = { relationTo: string; value: string; published: boolean; latest: boolean; layout: boolean }

export type RowPlan = {
  create: RowFlags[]
  update: Array<{ id: string | number } & RowFlags>
  remove: Array<string | number>
}

const keyOf = (ref: { relationTo: string; value: string | number }) => `${ref.relationTo}:${String(ref.value)}`

/**
 * The changes that make a document's stored rows match its references: one row per target,
 * flagged by where the target is used. A row used nowhere any more is removed. A draft save
 * (`published: null`) keeps the published flags it finds.
 */
export function planRows(stored: readonly StoredRow[], refs: SourceRefs): RowPlan {
  const wanted = new Map<string, RowFlags>()
  const flag = (ref: Ref) => {
    const key = keyOf(ref)
    let row = wanted.get(key)
    if (!row) wanted.set(key, (row = { relationTo: ref.relationTo, value: String(ref.value), published: false, latest: false, layout: false }))
    return row
  }
  if (refs.published) for (const ref of refs.published) flag(ref).published = true
  else for (const row of stored) if (row.published) flag(row).published = true
  for (const ref of refs.latest) flag(ref).latest = true
  for (const ref of refs.layout) flag(ref).layout = true

  const plan: RowPlan = { create: [], update: [], remove: [] }
  const seen = new Set<string>()
  for (const row of stored) {
    const key = keyOf(row)
    const next = wanted.get(key)
    if (!next || seen.has(key)) {
      // Gone, or a duplicate row for the same target.
      plan.remove.push(row.id)
      continue
    }
    seen.add(key)
    if (Boolean(row.published) !== next.published || Boolean(row.latest) !== next.latest || Boolean(row.layout) !== next.layout) {
      plan.update.push({ id: row.id, ...next })
    }
  }
  for (const [key, row] of wanted) if (!seen.has(key)) plan.create.push(row)
  return plan
}
