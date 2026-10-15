// Endpoints of page regions: document fields outside the layout that the builder shows and edits
// (the collection's `regions` option, core/regions.ts).
//
//   GET  {api}/builder/live/:collection/:id/regions?locale=   -> LiveRegionsResponse
//   POST {api}/builder/live/:collection/:id/fields            LiveFieldsRequest -> LiveFieldsResponse
//
// The fields stay the source of truth: a change goes through Payload's Local API as the user, so
// field access, hooks, validation, drafts, versions and the document lock apply as in the Edit
// view. The write gate (writeGate.ts) holds the document from the fresh read to the commit, so a
// region change never overwrites a session save or a settings drawer save, and the reverse.

import { addDataAndFileToRequest, docAccessOperation, type Endpoint, type PayloadRequest } from 'payload'

import { dataFields } from '../core/fields'
import { knownLocale, localeSettingsOf } from '../core/locale'
import { regionAccessAt, regionFieldOf, regionSelect, regionValues, setDocPath, valueAtDocPath } from '../core/regions'
import { isPlainObject } from '../core/tree'
import type { RegionConfig } from '../core/types'
import { payloadErrorMessage, payloadFieldErrors } from './apply'
import { LIVE_PATH, targetOf } from './endpoints'
import { defaultSettingsLocks, KEEP_LOCK_CONTEXT, type SettingsLocks } from './fieldsGuard'
import type { LiveRuntime } from './runtime'
import type { SessionTarget } from './session'
import type { LiveError, LiveFieldChange, LiveFieldConflict, LiveFieldsResponse, LiveRegionsResponse, RegionAccess } from './types'
import { defaultWriteGate, writeKey, type WriteGate } from './writeGate'

/** `context` flag of a save of region fields. */
export const REGION_SAVE_CONTEXT = 'builderRegionFields'

/** At most this many changes per request. */
const MAX_CHANGES = 50
const PATH = /^[A-Za-z_$][\w$-]*(\.([A-Za-z_$][\w$-]*|\d+))*$/

type Doc = Record<string, unknown>

/** The part of the Local API this module uses. Tests pass a fake. */
type RegionApi = {
  findByID(args: Record<string, unknown>): Promise<Doc>
  update(args: Record<string, unknown>): Promise<Doc>
  config: { localization?: unknown }
}

const api = (req: PayloadRequest) => req.payload as unknown as RegionApi
const json = (body: unknown, status = 200) => Response.json(body, { status })

export { regionAccessAt }

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

/** Payload's equality for a form value: empty values are equal, documents compare by id, keys in any order. */
function normalize(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null
  if (Array.isArray(value)) return value.length === 0 ? null : value.map(normalize)
  if (isPlainObject(value)) {
    if ('id' in value && ('createdAt' in value || 'updatedAt' in value)) return normalize(value.id)
    const out: Doc = {}
    for (const key of Object.keys(value).toSorted()) {
      const v = normalize(value[key])
      if (v !== null) out[key] = v
    }
    return Object.keys(out).length === 0 ? null : out
  }
  return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value
}

export const sameFieldValue = (a: unknown, b: unknown) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b))

/** The request's locale when Payload has localization and knows it. */
function localeOf(req: PayloadRequest, value: unknown): string | undefined {
  const settings = localeSettingsOf(api(req).config.localization)
  if (!settings) return undefined
  return knownLocale(settings, typeof value === 'string' ? value : null)
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

type Right = unknown
type Permission = true | { read?: Right; update?: Right; fields?: Permissions }
type Permissions = true | Record<string, Permission | undefined>

/**
 * True for an allowed right. Sanitized permissions say `true`; unsanitized ones and row-scoped
 * collection access say `{ permission: true, where }` (the document matched the `where`).
 */
const allowed = (right: Right) => right === true || (isPlainObject(right) && right.permission === true)

/** Every data path (without row numbers) a region field holds: the field itself and the fields inside it. */
function dataPathsOf(path: string, field: unknown): string[] {
  const out = [path]
  const f = field as { type?: string; fields?: unknown[] }
  if (f.type === 'group' || f.type === 'array') {
    for (const child of dataFields(f.fields)) out.push(...dataPathsOf(`${path}.${child.name}`, child))
  }
  return out
}

/** The read and update rights at a path of Payload's sanitized field permissions. */
function permissionAt(fields: Permissions, path: string): { read: boolean; update: boolean } {
  let level: Permissions = fields
  let read = true
  let update = true
  for (const segment of path.split('.')) {
    if (level === true) return { read, update }
    const entry: Permission | undefined = level[segment]
    if (!entry) return { read: false, update: false }
    if (entry === true) return { read, update }
    read &&= allowed(entry.read)
    update &&= allowed(entry.update)
    level = entry.fields ?? true
  }
  return { read, update }
}

/**
 * What the user may read and change in the regions, from Payload's own document access
 * (`docAccessOperation`: collection access and every field's `access`, for this document).
 */
export async function loadRegionAccess(req: PayloadRequest, target: SessionTarget, regions: readonly RegionConfig[]): Promise<RegionAccess> {
  const collection = (req.payload.collections as Record<string, Parameters<typeof docAccessOperation>[0]['collection'] | undefined>)[target.collection]
  if (!collection) return {}
  return regionAccessFrom(await docAccessOperation({ collection, id: target.id, req }), regions)
}

/** The regions' access from Payload's sanitized document permissions. */
export function regionAccessFrom(permissions: unknown, regions: readonly RegionConfig[]): RegionAccess {
  const { update, fields } = (permissions ?? {}) as { update?: unknown; fields?: Permissions }
  const canUpdate = allowed(update)
  const out: RegionAccess = {}
  for (const region of regions) {
    for (const field of region.fields) {
      for (const path of dataPathsOf(field.path, field.field)) {
        const right = permissionAt(fields ?? true, path)
        out[path] = { read: right.read, update: right.update && canUpdate }
      }
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

/**
 * The regions' values as the user may read them, in `locale` (ids, not documents): `values` with
 * Payload's locale fallback, `storedValues` the locale's own values (see `LiveRegionsResponse`).
 */
export async function loadRegionValues(
  req: PayloadRequest,
  target: SessionTarget,
  regions: readonly RegionConfig[],
  locale: string | undefined,
): Promise<{ values: Doc; storedValues: Doc; updatedAt: string | null }> {
  const read = (fallback: boolean) =>
    api(req).findByID({
      collection: target.collection,
      id: target.id,
      depth: 0,
      draft: target.drafts,
      overrideAccess: false,
      user: req.user,
      select: regionSelect(regions),
      ...(locale ? { locale } : {}),
      ...(fallback ? {} : { fallbackLocale: 'none' }),
    })
  const doc = await read(true)
  const values = regionValues(doc, regions)
  const updatedAt = typeof doc.updatedAt === 'string' ? doc.updatedAt : null
  if (!(req.payload.config as { localization?: unknown }).localization) return { values, storedValues: values, updatedAt }
  return { values, storedValues: ownValues(values, regionValues(await read(false), regions), regions), updatedAt }
}

/**
 * The locale's own values for every region field path that `values` has: the own value, or `null`
 * for none. Only paths the user may read (they are in `values`), so nothing else shows.
 */
function ownValues(values: Doc, own: Doc, regions: readonly RegionConfig[]): Doc {
  let out: Doc = {}
  for (const region of regions) {
    for (const field of region.fields) {
      if (valueAtDocPath(values, field.path) === undefined) continue
      const value = valueAtDocPath(own, field.path)
      const next = setDocPath(out, field.path, value === undefined ? null : value)
      if (next.ok) out = next.value
    }
  }
  return out
}

export type RegionWriteResult =
  | { ok: true; values: Doc; storedValues: Doc; updatedAt: string | null; changed: boolean }
  | { ok: false; status: number; error: string; conflicts?: LiveFieldConflict[]; errors?: LiveError[] }

/** Checks the request body: a list of changes at paths inside the regions. */
export function parseChanges(regions: readonly RegionConfig[], body: unknown): LiveFieldChange[] | string {
  const changes = isPlainObject(body) ? body.changes : undefined
  if (!Array.isArray(changes) || changes.length === 0) return '`changes` must be a list of changes.'
  if (changes.length > MAX_CHANGES) return `At most ${MAX_CHANGES} changes per request.`
  const out: LiveFieldChange[] = []
  for (const change of changes) {
    if (!isPlainObject(change) || typeof change.path !== 'string' || !PATH.test(change.path)) return 'Every change needs a field `path`.'
    if (!regionFieldOf(regions, change.path)) return `"${change.path}" is not a field of a region of this page.`
    if (!('value' in change)) return `The change of "${change.path}" has no \`value\`.`
    out.push({ path: change.path, value: change.value, ...('base' in change ? { base: change.base } : {}) })
  }
  return out
}

export type RegionWriteOptions = {
  target: SessionTarget
  regions: readonly RegionConfig[]
  changes: LiveFieldChange[]
  locale?: string
  runtime: LiveRuntime
  gate?: WriteGate
  settingsLocks?: SettingsLocks
  /** The user's access to the regions. Default: Payload's document access (`loadRegionAccess`). */
  access?: typeof loadRegionAccess
}

/** A loaded document (an upload, a relationship): one value, compared by its id. */
const isDocument = (value: Record<string, unknown>) => 'id' in value && ('createdAt' in value || 'updatedAt' in value)

/**
 * The new value with the stored values the editor never saw put back: fields of a group and of an
 * array row (matched by row id) that the user may not read are missing from what the editor sent,
 * and must not be erased by the save.
 */
export function keepHidden(stored: unknown, incoming: unknown): unknown {
  if (isPlainObject(incoming) && isPlainObject(stored) && !isDocument(incoming)) {
    const out: Doc = { ...stored }
    for (const key of Object.keys(incoming)) out[key] = keepHidden(stored[key], incoming[key])
    return out
  }
  if (Array.isArray(incoming) && Array.isArray(stored)) {
    return incoming.map((row) => {
      const id = isPlainObject(row) ? row.id : undefined
      const old = id === undefined || id === null ? undefined : stored.find((r) => isPlainObject(r) && r.id === id)
      return old === undefined ? row : keepHidden(old, row)
    })
  }
  return incoming
}

/**
 * The paths a change really changes, compared with what the user can see now: leaves inside
 * groups and array rows, or the array itself when rows come or go. Each needs update access, so a
 * whole-group change cannot slip a field past its access rule.
 */
export function changedPaths(before: unknown, after: unknown, path: string): string[] {
  if (isPlainObject(after) && !isDocument(after) && (before === undefined || before === null || (isPlainObject(before) && !isDocument(before)))) {
    const old = isPlainObject(before) ? before : {}
    return Object.keys(after)
      .filter((key) => key !== 'id')
      .flatMap((key) => changedPaths(old[key], after[key], `${path}.${key}`))
  }
  if (Array.isArray(after) && Array.isArray(before) && after.length === before.length) {
    return after.flatMap((row, i) => changedPaths(before[i], row, `${path}.${i}`))
  }
  return sameFieldValue(before, after) ? [] : [path]
}

/** A label for messages: the field's label, with the array row ("Links 2"). */
function changeLabel(regions: readonly RegionConfig[], path: string): string {
  const found = regionFieldOf(regions, path)
  if (!found) return path
  const row = /\.(\d+)(?:\.|$)/.exec(path.slice(found.field.path.length))
  return row ? `${found.field.label} ${Number(row[1]) + 1}` : found.field.label
}

/**
 * Saves changes of region fields as the request's user: a draft when the collection has drafts
 * (Publish publishes it with the layout), the document otherwise. The document's write gate is
 * held from the fresh read to the commit. Refused:
 * - 403 when the user may not change the document or one of the fields;
 * - 409 when a field changed since the editor read it (`conflicts`), or while the same user has the
 *   settings drawer open (its form holds an older copy of the fields and would save it back);
 * - 423 when someone else holds Payload's document lock (the Edit view or the settings drawer).
 */
export async function writeRegionFields(req: PayloadRequest, options: RegionWriteOptions): Promise<RegionWriteResult> {
  const { target, regions, changes, locale, runtime } = options
  const gate = options.gate ?? defaultWriteGate()
  const locks = options.settingsLocks ?? defaultSettingsLocks()
  const userId = (req.user as { id?: unknown } | null | undefined)?.id
  if (!(await runtime.canUpdate(req, target.collection, target.id))) {
    return { ok: false, status: 403, error: 'You are not allowed to change this document.' }
  }
  if ((typeof userId === 'string' || typeof userId === 'number') && locks.has(target.collection, target.id, userId)) {
    return { ok: false, status: 409, error: 'Close the settings drawer first: it holds its own copy of these fields and would save it over this change.' }
  }
  const access = await (options.access ?? loadRegionAccess)(req, target, regions)
  const refused = changes.filter((change) => !regionAccessAt(access, change.path).update)
  if (refused.length > 0) {
    return { ok: false, status: 403, error: `You are not allowed to change ${[...new Set(refused.map((c) => changeLabel(regions, c.path)))].join(', ')}.` }
  }
  const payload = api(req)
  const read = (fallback: boolean) =>
    payload.findByID({
      collection: target.collection,
      id: target.id,
      depth: 0,
      draft: target.drafts,
      // The plugin's own read of values it writes back: siblings the user may not read must stay.
      overrideAccess: true,
      ...(locale ? { locale } : {}),
      ...(fallback ? {} : { fallbackLocale: 'none' }),
    })
  return gate.run(writeKey(target.collection, target.id), req, async (): Promise<RegionWriteResult> => {
    try {
      // `shown`: what the user can see now, read as the user with Payload's locale fallback, as the
      // editor got it. Bases compare with it, and conflicts return values from it only: a field the
      // user may not read (also inside a group or an array row) is never in an answer.
      // `stored`: every value of this locale (no access, no fallback). The save builds on it, so
      // hidden fields stay and a fallback value never becomes a translation by itself.
      const { values: shown } = await loadRegionValues(req, target, regions, locale)
      const stored = await read(!locale)
      const conflicts: LiveFieldConflict[] = []
      for (const change of changes) {
        if (!('base' in change)) continue
        const now = valueAtDocPath(shown, change.path)
        if (!sameFieldValue(now, change.base) && !sameFieldValue(now, change.value)) conflicts.push({ path: change.path, value: now ?? null })
      }
      if (conflicts.length > 0) {
        const names = [...new Set(conflicts.map((c) => changeLabel(regions, c.path)))].join(', ')
        return { ok: false, status: 409, error: `Not saved: someone else changed ${names} a moment ago. The page shows their version now.`, conflicts }
      }
      const denied = changes.flatMap((change) => changedPaths(valueAtDocPath(shown, change.path), change.value, change.path)).filter((path) => !regionAccessAt(access, path).update)
      if (denied.length > 0) {
        return { ok: false, status: 403, error: `You are not allowed to change ${[...new Set(denied.map((path) => changeLabel(regions, path)))].join(', ')}.` }
      }
      let next: Doc = stored
      const touched = new Set<string>()
      for (const change of changes) {
        const value = keepHidden(valueAtDocPath(stored, change.path), change.value)
        if (sameFieldValue(valueAtDocPath(next, change.path), value)) continue
        const result = setDocPath(next, change.path, value)
        if (!result.ok) {
          return { ok: false, status: 409, error: `Not saved: ${changeLabel(regions, change.path)} is gone. Someone removed it a moment ago.` }
        }
        next = result.value
        touched.add(change.path.split('.')[0])
      }
      if (touched.size === 0) {
        const { values, storedValues, updatedAt } = await loadRegionValues(req, target, regions, locale)
        return { ok: true, values, storedValues, updatedAt, changed: false }
      }
      // Only the top-level fields that change. Payload merges them onto the newest version.
      const data = Object.fromEntries([...touched].map((name) => [name, next[name]]))
      await payload.update({
        collection: target.collection,
        id: target.id,
        data,
        depth: 0,
        draft: target.drafts,
        ...(target.drafts && target.autosave ? { autosave: true } : {}),
        ...(locale ? { locale } : {}),
        user: req.user,
        // The same request: the save does not wait for the gate it already holds.
        req,
        overrideAccess: false,
        // Someone else's lock (the Edit view, the settings drawer) refuses the save with 423.
        overrideLock: false,
        context: { [KEEP_LOCK_CONTEXT]: true, [REGION_SAVE_CONTEXT]: true },
      })
      const { values, storedValues, updatedAt } = await loadRegionValues(req, target, regions, locale)
      return { ok: true, values, storedValues, updatedAt, changed: true }
    } catch (error) {
      const status = statusOf(error)
      if (status === 423) {
        return { ok: false, status: 423, error: 'Not saved: someone else is editing this document’s settings right now. Try again when they finish.' }
      }
      const fields = payloadFieldErrors(error)
      if (fields.length > 0) {
        const errors: LiveError[] = fields.map((e) => ({ path: e.path, message: `${changeLabel(regions, e.path)}: ${e.message}`, code: 'invalid' }))
        return { ok: false, status: 400, error: `Not saved. ${payloadErrorMessage(error)}`, errors }
      }
      req.payload.logger.error({ err: error, msg: `[websiteBuilder] Could not save region fields of ${target.collection}:${String(target.id)}` })
      return { ok: false, status: status >= 400 && status < 600 ? status : 500, error: `Not saved: ${payloadErrorMessage(error)}` }
    }
  })
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export type RegionEndpointOptions = {
  collections: Record<string, { field: string; regions?: RegionConfig[] }>
  runtime: LiveRuntime
  gate?: WriteGate
  settingsLocks?: SettingsLocks
  /** The user's access to the regions. Default: Payload's document access. Tests pass a fake. */
  access?: typeof loadRegionAccess
}

export function regionEndpoints({ collections, runtime, gate, settingsLocks, access = loadRegionAccess }: RegionEndpointOptions): Endpoint[] {
  const regionsOf = (target: SessionTarget) => collections[target.collection]?.regions ?? []

  const read: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/regions`,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies LiveRegionsResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      const regions = regionsOf(target)
      if (regions.length === 0) return json({ ok: false, error: 'This collection has no regions.' } satisfies LiveRegionsResponse, 404)
      const url = new URL(req.url ?? 'http://localhost')
      try {
        const [{ values, storedValues, updatedAt }, rights] = await Promise.all([
          loadRegionValues(req, target, regions, localeOf(req, url.searchParams.get('locale'))),
          access(req, target, regions),
        ])
        return json({ ok: true, values, storedValues, access: rights, updatedAt } satisfies LiveRegionsResponse)
      } catch (error) {
        return json({ ok: false, error: 'Document not found or not readable' } satisfies LiveRegionsResponse, statusOf(error) === 403 ? 403 : 404)
      }
    },
  }

  const write: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/fields`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies LiveFieldsResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      const regions = regionsOf(target)
      if (regions.length === 0) return json({ ok: false, error: 'This collection has no regions.' } satisfies LiveFieldsResponse, 404)
      try {
        await addDataAndFileToRequest(req)
      } catch {
        return json({ ok: false, error: 'The body must be JSON' } satisfies LiveFieldsResponse, 400)
      }
      const changes = parseChanges(regions, req.data)
      if (typeof changes === 'string') return json({ ok: false, error: changes } satisfies LiveFieldsResponse, 400)
      const locale = localeOf(req, (req.data as { locale?: unknown } | undefined)?.locale)
      const result = await writeRegionFields(req, { target, regions, changes, locale, runtime, gate, settingsLocks, access })
      if (!result.ok) {
        const { status, ok: _ok, ...body } = result
        return json({ ok: false, ...body } satisfies LiveFieldsResponse, status)
      }
      return json({ ok: true, values: result.values, storedValues: result.storedValues, updatedAt: result.updatedAt } satisfies LiveFieldsResponse)
    },
  }

  return [read, write]
}
