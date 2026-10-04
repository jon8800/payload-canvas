// Protects a builder document's other fields (title, slug, SEO, …) while several people work on it.
//
// The live session owns the layout (see plugin/hook.ts). The other fields are edited in Payload's
// Edit view or in the builder's "Page settings" drawer (Payload's document drawer), so they use
// Payload's own document lock:
//
// - The builder view never takes the lock. The plugin's own saves (session drafts, publish,
//   unpublish, revert, the template "Default" flag) skip the lock check, as every Local API call
//   does by default. But Payload deletes the lock row on every update. So these saves read the
//   lock before the update and put it back in the same transaction: a person in the settings
//   drawer keeps the lock while others edit the layout.
// - Payload also deletes the lock after each save of the lock holder, autosave included. On a
//   collection with a short autosave interval the lock is often gone, and a second person with an
//   old copy of the form could overwrite the first person's change. The stale-save check catches
//   this: a save that would undo a field change someone else made after the form was loaded is
//   rejected with 409, and the message names the person and the fields.
//
// The field clock lives in memory, like the sessions (one server process). After a restart it
// starts empty, so the check only covers changes made since then.

import { actorFromUser } from './apply'

/** `context` flag of the plugin's own saves (publish, unpublish, revert): keep the lock, no stale check. */
export const KEEP_LOCK_CONTEXT = 'builderKeepLock'
/** Slug of Payload's lock collection. */
export const LOCKED_DOCUMENTS_SLUG = 'payload-locked-documents'

const KEPT_LOCKS_CONTEXT = 'builderKeptLocks'
const CHANGED_FIELDS_CONTEXT = 'builderChangedFields'

/** Fields that never count as a change: the id, the timestamps and the publish status. */
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt', '_status', 'deletedAt'])

type Context = Record<string, unknown>
type Doc = Record<string, unknown>

const docKey = (collection: string, id: unknown) => `${collection}:${String(id)}`

// ---------------------------------------------------------------------------
// Changed fields
// ---------------------------------------------------------------------------

/** A value in a form that compares equal to the stored value, whatever the format. */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.length === 0 ? null : value.map(normalize)
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    // A populated relationship or upload compares by its id.
    if ('id' in object && ('createdAt' in object || 'updatedAt' in object)) return normalize(object.id)
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(object).toSorted()) {
      const v = normalize(object[key])
      if (v !== null) out[key] = v
    }
    return Object.keys(out).length === 0 ? null : out
  }
  return String(value)
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))
}

/**
 * The top-level fields whose value in `data` differs from `current`. Leaves out the fields in
 * `skip` (the layout and the plugin's own fields), the id, the timestamps and `_status`.
 */
export function changedFields(data: Doc, current: Doc | undefined, skip: ReadonlySet<string>): string[] {
  return Object.keys(data).filter((key) => !SYSTEM_FIELDS.has(key) && !skip.has(key) && !sameValue(data[key], current?.[key]))
}

// ---------------------------------------------------------------------------
// Field clock
// ---------------------------------------------------------------------------

/** Who changed a field last, and when (the document's `updatedAt` after that save). */
type FieldChange = { at: number; by: string; label: string }

export type FieldConflict = { field: string; at: string; label: string }

export type FieldClock = {
  /** Remembers that `by` changed `fields` in a save that ended at `at` (the new `updatedAt`). */
  record(collection: string, id: string | number, fields: readonly string[], change: { at: unknown; by: string; label: string }): void
  /**
   * The fields in `fields` that someone other than `by` changed after `base` (the `updatedAt` the
   * form was loaded with).
   */
  conflicts(collection: string, id: string | number, fields: readonly string[], args: { base: string; by: string }): FieldConflict[]
}

/** An in-memory field clock. Keeps the last `maxDocs` documents. */
export function createFieldClock(maxDocs = 5000): FieldClock {
  const docs = new Map<string, Map<string, FieldChange>>()
  return {
    record(collection, id, fields, change) {
      const at = typeof change.at === 'string' ? Date.parse(change.at) : Number.NaN
      if (!Number.isFinite(at) || fields.length === 0) return
      const key = docKey(collection, id)
      const entry = docs.get(key) ?? new Map<string, FieldChange>()
      // Insert again, so the Map's order is "least recently changed first".
      docs.delete(key)
      for (const field of fields) entry.set(field, { at, by: change.by, label: change.label })
      docs.set(key, entry)
      if (docs.size > maxDocs) {
        const oldest = docs.keys().next().value
        if (oldest !== undefined) docs.delete(oldest)
      }
    },
    conflicts(collection, id, fields, { base, by }) {
      const since = Date.parse(base)
      const entry = docs.get(docKey(collection, id))
      if (!entry || !Number.isFinite(since)) return []
      const out: FieldConflict[] = []
      for (const field of fields) {
        const change = entry.get(field)
        if (change && change.by !== by && change.at > since) {
          out.push({ field, at: new Date(change.at).toISOString(), label: change.label })
        }
      }
      return out
    },
  }
}

const CLOCK_KEY = Symbol.for('@payload-toolkit/builder/field-clock')

/** The process-wide field clock. Kept on `globalThis`, so a dev hot reload keeps it. */
export function defaultFieldClock(): FieldClock {
  const store = globalThis as unknown as Record<symbol, FieldClock | undefined>
  store[CLOCK_KEY] ??= createFieldClock()
  return store[CLOCK_KEY]
}

// ---------------------------------------------------------------------------
// Stale-save check (beforeChange) and record (afterChange)
// ---------------------------------------------------------------------------

type FieldLike = { name?: unknown; label?: unknown; fields?: unknown; tabs?: unknown }

/** The label of a top-level field (also inside rows, collapsibles and unnamed tabs), else its name in words. */
export function topFieldLabel(fields: unknown, name: string): string {
  const walk = (list: unknown): FieldLike | undefined => {
    if (!Array.isArray(list)) return undefined
    for (const item of list as FieldLike[]) {
      if (!item || typeof item !== 'object') continue
      if (item.name === name) return item
      if (typeof item.name === 'string') continue
      const nested = Array.isArray(item.tabs) ? walk(item.tabs) : walk(item.fields)
      if (nested) return nested
    }
    return undefined
  }
  const label = walk(fields)?.label
  if (typeof label === 'string' && label) return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string' && first) return first
  }
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function listText(items: string[]): string {
  if (items.length <= 1) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/** The message of a rejected stale save. */
export function staleSaveMessage(conflicts: readonly FieldConflict[], labelOf: (field: string) => string): string {
  const who = listText([...new Set(conflicts.map((c) => c.label))])
  const what = listText(conflicts.map((c) => labelOf(c.field)))
  return `Not saved. ${who} changed ${what} after you opened this form. Reload it to get their changes, then make your edit again.`
}

export type StaleCheckArgs = {
  clock: FieldClock
  collection: string
  id: string | number
  data: Doc
  originalDoc: Doc | undefined
  /** The layout field and the plugin's own fields. */
  skip: ReadonlySet<string>
  user: unknown
  context: Context | undefined
  /** A save by the plugin itself: no check, the changes are still recorded. */
  pluginSave: boolean
}

/**
 * Runs in beforeChange of an update. Returns the conflicts when the save would undo another
 * person's newer change (the caller rejects the save). Otherwise remembers the changed fields in
 * `context`, so `recordFieldChanges` can record them after the save.
 *
 * The form's base is `data.updatedAt`: Payload's edit form sends the `updatedAt` it loaded (and
 * got back from its own last save). A save without it (most API clients) is not checked.
 */
export function checkStaleSave(args: StaleCheckArgs): FieldConflict[] {
  const { clock, collection, id, data, originalDoc, skip, user, context, pluginSave } = args
  const changed = changedFields(data, originalDoc, skip)
  if (changed.length === 0) return []
  const base = data.updatedAt
  if (!pluginSave && typeof base === 'string') {
    const conflicts = clock.conflicts(collection, id, changed, { base, by: actorFromUser(user).id })
    if (conflicts.length > 0) return conflicts
  }
  if (context) {
    const pending = (context[CHANGED_FIELDS_CONTEXT] ??= {}) as Record<string, string[]>
    pending[docKey(collection, id)] = changed
  }
  return []
}

/** Runs in afterChange: records the fields `checkStaleSave` saw change, with the new `updatedAt`. */
export function recordFieldChanges(args: { clock: FieldClock; collection: string; doc: Doc; user: unknown; context: Context | undefined }): void {
  const { clock, collection, doc, user, context } = args
  const pending = context?.[CHANGED_FIELDS_CONTEXT] as Record<string, string[]> | undefined
  const key = docKey(collection, doc.id)
  const changed = pending?.[key]
  if (!pending || !changed) return
  delete pending[key]
  const actor = actorFromUser(user)
  clock.record(collection, doc.id as string | number, changed, { at: doc.updatedAt, by: actor.id, label: actor.label })
}

// ---------------------------------------------------------------------------
// Keeping Payload's document lock across the plugin's own saves
// ---------------------------------------------------------------------------

/** One row of Payload's lock collection, as the database adapter returns it. */
export type LockRow = Record<string, unknown>

/** The part of the Payload instance the lock helpers use. Tests pass a fake. */
export type LockPayload = {
  db: {
    find(args: Record<string, unknown>): Promise<{ docs: LockRow[] }>
    create(args: Record<string, unknown>): Promise<unknown>
  }
  collections: Record<string, { config: { lockDocuments?: unknown } } | undefined>
}

const lockWhere = (collection: string, id: string | number) => ({
  and: [{ 'document.relationTo': { equals: collection } }, { 'document.value': { equals: id } }],
})

function lockingOn(payload: LockPayload, collection: string): boolean {
  return Boolean(payload.collections[LOCKED_DOCUMENTS_SLUG]) && payload.collections[collection]?.config.lockDocuments !== false
}

async function findLocks(payload: LockPayload, req: unknown, collection: string, id: string | number): Promise<LockRow[]> {
  const result = await payload.db.find({ collection: LOCKED_DOCUMENTS_SLUG, where: lockWhere(collection, id), limit: 10, pagination: false, req })
  return result.docs ?? []
}

/** Runs in beforeOperation of a plugin save: remembers the document's lock rows in `context`. */
export async function rememberLocks(args: { payload: LockPayload; req: unknown; collection: string; id: string | number; context: Context }): Promise<void> {
  const { payload, req, collection, id, context } = args
  if (!lockingOn(payload, collection)) return
  const rows = await findLocks(payload, req, collection, id)
  if (rows.length === 0) return
  const kept = (context[KEPT_LOCKS_CONTEXT] ??= {}) as Record<string, LockRow[]>
  kept[docKey(collection, id)] = rows
}

/**
 * Runs in afterChange of a plugin save: puts back the lock rows Payload deleted, with their owner
 * and times, so the lock expires when it would have. Does nothing when a lock exists again.
 * Returns the number of rows put back.
 */
export async function restoreLocks(args: { payload: LockPayload; req: unknown; collection: string; id: string | number; context: Context | undefined }): Promise<number> {
  const { payload, req, collection, id, context } = args
  const kept = context?.[KEPT_LOCKS_CONTEXT] as Record<string, LockRow[]> | undefined
  const key = docKey(collection, id)
  const rows = kept?.[key]
  if (!kept || !rows) return 0
  delete kept[key]
  if ((await findLocks(payload, req, collection, id)).length > 0) return 0
  for (const row of rows) {
    const data: Record<string, unknown> = {}
    for (const name of ['document', 'user', 'createdAt', 'updatedAt']) {
      if (row[name] !== undefined && row[name] !== null) data[name] = row[name]
    }
    await payload.db.create({ collection: LOCKED_DOCUMENTS_SLUG, data, req, returning: false })
  }
  return rows.length
}
