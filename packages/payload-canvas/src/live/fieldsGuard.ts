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
// - The settings drawer takes the lock when it opens (Payload's form only takes it at the first
//   change) and gives it back when it closes. Payload also deletes the lock after each save of the
//   lock holder, autosave included, so with a short autosave interval the lock would be gone most
//   of the time. While the drawer is open, its owner's own saves keep the lock the same way.
//   So the second person to open the drawer gets Payload's "Document locked" dialog.
// - If the lock is gone anyway (it expired, a restart, the Edit view with autosave), a second
//   person with an old copy of the form could still overwrite the first person's change. The
//   stale-save check catches this: a save that would undo a field change someone else made after
//   the form was loaded is rejected with 409. The message names the person and the fields, and
//   each such field gets an error (staleMessages.ts), so the form shows it next to the field.
//
// The field clock lives in memory, like the sessions (one server process). After a restart it
// starts empty, so the check only covers changes made since then.

import { actorFromUser } from './apply'
import { staleFieldMessage } from './staleMessages'

export { topFieldLabel } from './staleMessages'

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

const CLOCK_KEY = Symbol.for('payload-canvas/field-clock')

/** The process-wide field clock. Kept on `globalThis`, so a dev hot reload keeps it. */
export function defaultFieldClock(): FieldClock {
  const store = globalThis as unknown as Record<symbol, FieldClock | undefined>
  store[CLOCK_KEY] ??= createFieldClock()
  return store[CLOCK_KEY]
}

// ---------------------------------------------------------------------------
// Stale-save check (beforeChange) and record (afterChange)
// ---------------------------------------------------------------------------

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

/**
 * The `data` of the rejected save's APIError: one error per field, with the field's path, so
 * Payload's form marks each field (and keeps what the user typed).
 */
export function staleSaveErrors(conflicts: readonly FieldConflict[]): { errors: { path: string; message: string }[] } {
  return { errors: conflicts.map((c) => ({ path: c.field, message: staleFieldMessage(c.label) })) }
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

/** The id of the user who holds a lock row, as text. */
function lockOwner(row: LockRow): string | null {
  const user = row.user as { value?: unknown } | null | undefined
  const value = user && typeof user === 'object' ? user.value : user
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/**
 * Runs in beforeOperation of a plugin save: remembers the document's lock rows in `context`.
 * With `owner`, only that user's rows (a settings drawer owner's own save).
 */
export async function rememberLocks(args: {
  payload: LockPayload
  req: unknown
  collection: string
  id: string | number
  context: Context
  owner?: string | number
}): Promise<void> {
  const { payload, req, collection, id, context, owner } = args
  if (!lockingOn(payload, collection)) return
  const found = await findLocks(payload, req, collection, id)
  const rows = owner === undefined ? found : found.filter((row) => lockOwner(row) === String(owner))
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

// ---------------------------------------------------------------------------
// The settings drawer's lock
// ---------------------------------------------------------------------------

/** Who has the builder's settings drawer open, per document. In memory, like the sessions. */
export type SettingsLocks = {
  add(collection: string, id: string | number, user: string | number): void
  remove(collection: string, id: string | number, user: string | number): void
  has(collection: string, id: string | number, user: string | number): boolean
}

export function createSettingsLocks(): SettingsLocks {
  const holders = new Map<string, Set<string>>()
  return {
    add(collection, id, user) {
      const key = docKey(collection, id)
      const set = holders.get(key) ?? new Set<string>()
      set.add(String(user))
      holders.set(key, set)
    },
    remove(collection, id, user) {
      const key = docKey(collection, id)
      const set = holders.get(key)
      set?.delete(String(user))
      if (set?.size === 0) holders.delete(key)
    },
    has(collection, id, user) {
      return holders.get(docKey(collection, id))?.has(String(user)) ?? false
    },
  }
}

const SETTINGS_LOCKS_KEY = Symbol.for('payload-canvas/settings-locks')

/** The process-wide settings drawer holders. Kept on `globalThis`, so a dev hot reload keeps them. */
export function defaultSettingsLocks(): SettingsLocks {
  const store = globalThis as unknown as Record<symbol, SettingsLocks | undefined>
  store[SETTINGS_LOCKS_KEY] ??= createSettingsLocks()
  return store[SETTINGS_LOCKS_KEY]
}

/** The lock helpers that delete rows. Tests pass a fake. */
export type LockWritePayload = LockPayload & {
  db: LockPayload['db'] & { deleteMany(args: Record<string, unknown>): Promise<unknown> }
}

const DEFAULT_LOCK_SECONDS = 300

function lockDurationMs(payload: LockPayload, collection: string): number {
  const option = payload.collections[collection]?.config.lockDocuments
  const seconds = option && typeof option === 'object' ? Number((option as { duration?: unknown }).duration) : Number.NaN
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_LOCK_SECONDS) * 1000
}

function lockIsActive(row: LockRow, durationMs: number, now: number): boolean {
  const at = Date.parse(String(row.updatedAt ?? ''))
  return Number.isFinite(at) && at > now - durationMs
}

/**
 * `off`: locking is off for the collection. `taken`: the user holds the lock now (a new row, or
 * it was already theirs). `other`: someone else holds a live lock, so Payload's drawer shows its
 * "Document locked" dialog.
 */
export type SettingsLockResult = 'off' | 'taken' | 'other'

/**
 * The settings drawer opens: takes Payload's document lock for `user`, as Payload's form does at
 * its first change (expired rows go, a new row comes). Leaves another person's live lock alone.
 * While the user is listed in `holders`, their own saves keep the lock (keepLockBeforeOperation).
 */
export async function takeSettingsLock(args: {
  payload: LockWritePayload
  req: unknown
  collection: string
  id: string | number
  user: { id: string | number; collection: string }
  holders: SettingsLocks
  now?: number
}): Promise<SettingsLockResult> {
  const { payload, req, collection, id, user, holders } = args
  if (!lockingOn(payload, collection)) return 'off'
  const now = args.now ?? Date.now()
  const duration = lockDurationMs(payload, collection)
  const rows = await findLocks(payload, req, collection, id)
  const active = rows.filter((row) => lockIsActive(row, duration, now))
  // Listed also when someone else holds the lock: after "Take over" in Payload's dialog the lock
  // is the user's, and their saves must keep it. Only the user's own rows are ever kept.
  holders.add(collection, id, user.id)
  if (active.some((row) => lockOwner(row) !== String(user.id))) return 'other'
  if (active.length > 0) return 'taken'
  if (rows.length > 0) await payload.db.deleteMany({ collection: LOCKED_DOCUMENTS_SLUG, where: lockWhere(collection, id), req })
  await payload.db.create({
    collection: LOCKED_DOCUMENTS_SLUG,
    data: { document: { relationTo: collection, value: id }, user: { relationTo: user.collection, value: user.id } },
    req,
    returning: false,
  })
  return 'taken'
}

/** The settings drawer closed: deletes `user`'s lock on the document. Returns the number of rows deleted. */
export async function releaseSettingsLock(args: {
  payload: LockWritePayload
  req: unknown
  collection: string
  id: string | number
  user: { id: string | number }
  holders: SettingsLocks
}): Promise<number> {
  const { payload, req, collection, id, user, holders } = args
  holders.remove(collection, id, user.id)
  if (!lockingOn(payload, collection)) return 0
  const own = (await findLocks(payload, req, collection, id)).filter((row) => lockOwner(row) === String(user.id))
  if (own.length === 0) return 0
  await payload.db.deleteMany({
    collection: LOCKED_DOCUMENTS_SLUG,
    where: { and: [...lockWhere(collection, id).and, { id: { in: own.map((row) => row.id) } }] },
    req,
  })
  return own.length
}
