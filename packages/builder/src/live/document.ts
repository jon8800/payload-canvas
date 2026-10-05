// The document behind the full-screen builder: what its top bar shows (title, status, dates,
// links) and the publish actions. Publishing goes through Payload's Local API as the signed-in
// user, so access control, hooks, versions and the CSS save hook all apply. While a session is
// open, the save-hook guard gives every save the session's layout.
//
//   GET  {api}/builder/live/:collection/:id/meta       -> BuilderDocMeta
//   POST {api}/builder/live/:collection/:id/publish    -> PublishResponse
//   POST {api}/builder/live/:collection/:id/unpublish  -> PublishResponse
//   POST {api}/builder/live/:collection/:id/revert     -> PublishResponse
//   POST {api}/builder/live/:collection/:id/restore    -> PublishResponse  (body: { versionId })
//   POST   {api}/builder/live/:collection/:id/settings-lock -> SettingsLockResponse (the drawer opens)
//   DELETE {api}/builder/live/:collection/:id/settings-lock -> SettingsLockResponse (the drawer closes)

import { addDataAndFileToRequest, restoreVersionOperation, type Collection, type Endpoint, type PayloadRequest } from 'payload'

import { TEMPLATE_DEFAULT_FIELD, TEMPLATE_PREVIEW_FIELD, TEMPLATE_TARGET_FIELD } from '../core/bindings'
import { describeLayoutErrors, summarizeProblems } from '../core/issues'
import { normalizeLayout } from '../core/tree'
import { hasPropAccess, type PropAccessInfo } from '../core/fieldAccess'
import type { FieldRegistry } from '../core/fieldSemantics'
import type { BlockDefinition, LocaleSettings } from '../core/types'
import { checkLayout, RAW_LAYOUT_CONTEXT, STORED_LAYOUT_CONTEXT, type BindingCheck } from '../plugin/hook'
import { documentPath, draftPreviewPath } from '../plugin/links'
import { payloadErrorMessage, payloadFieldErrors } from './apply'
import { propAccessFor } from './fieldChecks'
import { defaultSettingsLocks, KEEP_LOCK_CONTEXT, releaseSettingsLock, takeSettingsLock, type LockWritePayload } from './fieldsGuard'
import { LIVE_PATH, requestActor, targetOf } from './endpoints'
import type { LiveRuntime } from './runtime'
import type { SessionTarget } from './session'
import type {
  BuilderDocMeta,
  DocStatus,
  LiveAccessResponse,
  LiveError,
  LivePublishedEvent,
  PublishAction,
  PublishResponse,
  SettingsLockResponse,
} from './types'

/** One builder collection as the server sees it. */
export type BuilderCollectionServer = {
  /** Name of the layout field. */
  field: string
  /** Public path of a document (the plugin's `url` option). */
  url?: (doc: Record<string, unknown>) => string
  /**
   * Fields the builder replaced but the collection still has (the old `blocks` field after
   * `migrateBlocksField`). Publish from the builder keeps their published value, so a newer draft
   * of the old field never goes live with it.
   */
  legacyFields?: readonly string[]
  /** The locales of the layout's localized props. Null or left out: not localized. */
  localization?: LocaleSettings | null
}

/** The builder collections and the templates collection. Stored on `config.custom` for the admin view. */
export type BuilderServerConfig = {
  collections: Record<string, BuilderCollectionServer>
  /** Slug of the templates collection, when templates are on. */
  templates: string | null
}

/** Key under `config.custom` where the plugin stores the `BuilderServerConfig`. */
export const BUILDER_CONFIG_KEY = 'websiteBuilder'

export function builderConfigOf(payload: { config: { custom?: Record<string, unknown> } }): BuilderServerConfig | null {
  const stored = payload.config.custom?.[BUILDER_CONFIG_KEY] as Partial<BuilderServerConfig> | undefined
  return stored?.collections ? { collections: stored.collections, templates: stored.templates ?? null } : null
}

/** The part of the Payload Local API this module uses. Tests pass a fake. */
type DocApi = {
  findByID(args: Record<string, unknown>): Promise<Record<string, unknown>>
  update(args: Record<string, unknown>): Promise<Record<string, unknown>>
  find?(args: Record<string, unknown>): Promise<{ docs: Record<string, unknown>[] }>
  countVersions?(args: Record<string, unknown>): Promise<{ totalDocs: number }>
  findVersionByID?(args: Record<string, unknown>): Promise<{ parent?: unknown; version?: Record<string, unknown> }>
  collections: Record<string, { config: { admin?: { useAsTitle?: string }; versions?: unknown; fields?: unknown } } | undefined>
}

const api = (req: PayloadRequest) => req.payload as unknown as DocApi

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

export { payloadErrorMessage }

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : 500
}

export type DocMetaArgs = {
  target: SessionTarget
  url?: (doc: Record<string, unknown>) => string
  /** The document is a template (templates collection). */
  isTemplate: boolean
  /** The document is a saved section (saved sections collection). */
  isSection?: boolean
  canUpdate: boolean
  /** Block definitions and field logic: the meta then holds the user's prop access. */
  access?: FieldAccessArgs
}

/** What the prop access check needs. `runtime` gives the open session's layout. */
export type FieldAccessArgs = { blocks: readonly BlockDefinition[]; registry: FieldRegistry; runtime: LiveRuntime }

/**
 * The request user's prop access in the document (see `propAccessFor`): checked against the open
 * session's layout, else the saved draft's stored layout. Null without access rules.
 */
export async function loadFieldAccess(req: PayloadRequest, target: SessionTarget, access: FieldAccessArgs): Promise<PropAccessInfo | null> {
  const { blocks, registry, runtime } = access
  if (!hasPropAccess(registry, 'read') && !hasPropAccess(registry, 'update')) return null
  let open = runtime.sessions.peek(target.collection, target.id)
  if (!open) {
    // The stored layout: access functions read every value, also the ones this user may not read.
    const doc = await api(req).findByID({
      collection: target.collection,
      id: target.id,
      depth: 0,
      draft: target.drafts,
      overrideAccess: false,
      user: req.user,
      req,
      context: { [RAW_LAYOUT_CONTEXT]: true },
    })
    const { [target.field]: layout, ...rest } = doc
    open = { sessionId: '', seq: 0, layout: normalizeLayout(layout), doc: rest }
  }
  return propAccessFor(req, { blocks, registry, collection: target.collection, id: target.id, field: target.field, layout: open.layout, doc: open.doc })
}

/**
 * Reads the document as the request's user (throws Payload's NotFound or Forbidden) and returns
 * what the builder's top bar shows. The status follows Payload's own header: `changed` means
 * there is a published version and a newer draft.
 */
export async function loadDocMeta(req: PayloadRequest, args: DocMetaArgs): Promise<BuilderDocMeta> {
  const { target, url, isTemplate, canUpdate } = args
  const payload = api(req)
  // Unreadable or failing access checks leave the inspector open as before: the server still refuses edits.
  const fieldAccess = args.access ? loadFieldAccess(req, target, args.access).catch(() => null) : Promise.resolve(null)
  const common = { collection: target.collection, id: target.id, depth: 0, overrideAccess: false, user: req.user, req }
  const draft = await payload.findByID({ ...common, draft: target.drafts })
  const config = payload.collections[target.collection]?.config

  let status: DocStatus | null = null
  let publishedAt: string | null = null
  if (target.drafts) {
    if (draft._status === 'published') {
      status = 'published'
      publishedAt = text(draft.updatedAt)
    } else {
      // The main document holds the published version while newer drafts exist.
      const main = await payload.findByID({ ...common, draft: false }).catch(() => null)
      const published = main?._status === 'published'
      status = published ? 'changed' : 'draft'
      publishedAt = published ? text(main?.updatedAt) : null
    }
  }

  let versions: number | null = null
  if (config?.versions && payload.countVersions) {
    try {
      versions = (await payload.countVersions({ ...common, where: { parent: { equals: target.id } } })).totalDocs
    } catch {
      versions = null
    }
  }

  // The published default template of the target collection: documents without a template of
  // their own use it. The editor's sample picker marks documents that use another template.
  let defaultId: string | number | null = null
  const templateTarget = isTemplate ? text(draft[TEMPLATE_TARGET_FIELD]) : null
  if (templateTarget && payload.find) {
    try {
      const found = await payload.find({
        collection: target.collection,
        where: { and: [{ [TEMPLATE_TARGET_FIELD]: { equals: templateTarget } }, { [TEMPLATE_DEFAULT_FIELD]: { equals: true } }] },
        limit: 1,
        depth: 0,
        pagination: false,
        draft: false,
        overrideAccess: false,
        user: req.user,
        req,
      })
      const id = found.docs[0]?.id
      defaultId = typeof id === 'string' || typeof id === 'number' ? id : null
    } catch {
      defaultId = null
    }
  }

  const useAsTitle = config?.admin?.useAsTitle
  const titleField = useAsTitle && useAsTitle !== 'id' ? useAsTitle : null
  return {
    collection: target.collection,
    id: target.id,
    title: (titleField ? text(draft[titleField]) : null) ?? target.id,
    titleField,
    drafts: target.drafts,
    status,
    createdAt: text(draft.createdAt),
    updatedAt: text(draft.updatedAt),
    publishedAt,
    versions,
    url: documentPath(url, draft),
    previewUrl: await draftPreviewPath(req, target.collection, draft),
    canUpdate,
    template: isTemplate
      ? { target: text(draft[TEMPLATE_TARGET_FIELD]), preview: draft[TEMPLATE_PREVIEW_FIELD] ?? null, defaultId }
      : null,
    section: args.isSection ? { category: text(draft.category) } : null,
    fieldAccess: await fieldAccess,
  }
}

type ActionResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; status: number; error: string; errors?: LiveError[] }

/**
 * Block definitions, binding rules and the props' own field logic for the publish check. Without
 * them, Payload's own errors only.
 */
export type PublishCheck = {
  blocks: readonly BlockDefinition[]
  bindings?: BindingCheck
  fieldRegistry?: FieldRegistry
  /** The document's locales: translations are checked too. */
  localization?: LocaleSettings | null
}

/**
 * The published values of the legacy fields, to send with Publish. Empty when the document was
 * never published: then the old field has no published value to keep, and its draft goes live.
 */
async function publishedLegacyValues(
  payload: DocApi,
  target: SessionTarget,
  legacyFields: readonly string[] | undefined,
): Promise<Record<string, unknown>> {
  if (!legacyFields?.length) return {}
  // The plugin's own read of values it writes back unchanged: no field access, no prop hooks.
  const published = await payload.findByID({
    collection: target.collection,
    id: target.id,
    depth: 0,
    draft: false,
    overrideAccess: true,
    context: { [RAW_LAYOUT_CONTEXT]: true },
  })
  if (published._status !== 'published') return {}
  return Object.fromEntries(legacyFields.map((name) => [name, published[name] ?? null]))
}

type FieldLike = { name?: unknown; label?: unknown; fields?: unknown; tabs?: unknown }

/** The label of a document field at a dot path ("meta.title"), through groups, rows and tabs. */
function fieldLabel(fields: unknown, path: string): string | undefined {
  let list: unknown = fields
  let found: FieldLike | undefined
  for (const key of path.replace(/\[\d+\]/g, '').split('.')) {
    found = flatten(list).find((f) => f.name === key)
    if (!found) return undefined
    list = found.fields
  }
  const label = found?.label
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') {
    const first = (label as Record<string, unknown>).en ?? Object.values(label)[0]
    if (typeof first === 'string') return first
  }
  return undefined
}

function flatten(list: unknown): FieldLike[] {
  if (!Array.isArray(list)) return []
  const out: FieldLike[] = []
  for (const item of list as FieldLike[]) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.name === 'string') out.push(item)
    else if (Array.isArray(item.fields)) out.push(...flatten(item.fields))
    else if (Array.isArray(item.tabs)) for (const tab of item.tabs as FieldLike[]) {
      if (typeof tab.name === 'string') out.push(tab)
      else out.push(...flatten(tab.fields))
    }
  }
  return out
}

function humanize(path: string): string {
  const name = path.split('.').at(-1) ?? path
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/**
 * A failed save as readable problems: one per document field ("Title: This field is required."),
 * one per line of the layout field's message. Deduplicated. `labels` are the field labels.
 */
export function documentErrorsOf(error: unknown, fields: unknown, layoutField: string): { errors: LiveError[]; labels: string[] } {
  const errors: LiveError[] = []
  const labels: string[] = []
  const seen = new Set<string>()
  for (const e of payloadFieldErrors(error)) {
    const lines = e.path === layoutField ? e.message.split('\n').filter(Boolean) : [e.message]
    for (const line of lines) {
      let message = line
      if (e.path && e.path !== layoutField) {
        // Payload's label carries the tab path ("Content > Title"); keep the field's own name.
        const label = fieldLabel(fields, e.path) ?? e.label?.split(' > ').at(-1) ?? humanize(e.path)
        message = `${label}: ${line}`
        if (!labels.includes(label)) labels.push(label)
      }
      const key = `${e.path}\0${message}`
      if (seen.has(key)) continue
      seen.add(key)
      errors.push({ path: e.path, message, code: 'invalid' })
    }
  }
  return { errors, labels }
}

/**
 * Publish, unpublish or revert, as the request's user. Publish saves the session's unsaved
 * commits first, so no older draft lands after the published version. With `check`, Publish
 * first validates the layout and returns every block problem with its block id, so the editor
 * can point at the blocks. Revert resets the open session to the published layout (every editor
 * reloads), then saves the published data again, the same way Payload's own "Revert to
 * published" does.
 */
export async function runPublishAction(
  req: PayloadRequest,
  {
    target,
    action,
    runtime,
    check,
    legacyFields,
  }: { target: SessionTarget; action: PublishAction; runtime: LiveRuntime; check?: PublishCheck; legacyFields?: readonly string[] },
): Promise<ActionResult> {
  if (action === 'restore') return { ok: false, status: 400, error: 'Restore needs a version: use restoreDocumentVersion.' }
  if (!target.drafts) return { ok: false, status: 400, error: 'This collection has no drafts, so there is nothing to publish.' }
  if (!(await runtime.canUpdate(req, target.collection, target.id))) {
    return { ok: false, status: 403, error: 'You are not allowed to change this document.' }
  }
  const payload = api(req)
  const common = { collection: target.collection, id: target.id, depth: 0, overrideAccess: false, user: req.user, req }
  // A plugin save: it skips Payload's document lock and keeps it (someone may be in the settings
  // drawer). See fieldsGuard.ts.
  const save = { ...common, overrideLock: true, context: { [KEEP_LOCK_CONTEXT]: true, [STORED_LAYOUT_CONTEXT]: true } }
  const localization = check?.localization ?? null
  const fields = payload.collections[target.collection]?.config.fields
  try {
    let doc: Record<string, unknown>
    if (action === 'revert') {
      // The stored layout: Revert saves it again, so props the user may not read must stay in it.
      const published = await payload.findByID({ ...common, draft: false, context: { [RAW_LAYOUT_CONTEXT]: true } })
      if (published._status !== 'published') return { ok: false, status: 409, error: 'This document has no published version.' }
      await runtime.sessions.reset(target.collection, target.id, normalizeLayout(published[target.field]))
      const { id: _id, ...data } = published
      doc = await payload.update({ ...save, data: { ...data, _status: 'published' }, draft: false })
    } else {
      await runtime.sessions.flush(target.collection, target.id)
      if (action === 'publish' && check) {
        const draft = await payload.findByID({ ...common, draft: true, context: { [RAW_LAYOUT_CONTEXT]: true } })
        const layout = runtime.sessions.peek(target.collection, target.id)?.layout ?? normalizeLayout(draft[target.field])
        const config = (req.payload.collections as Record<string, { config: unknown } | undefined>)[target.collection]?.config
        const { blocking } = await checkLayout(layout, {
          blocks: check.blocks,
          publishing: true,
          bindings: check.bindings,
          localization,
          doc: draft,
          fields: check.fieldRegistry
            ? {
                registry: check.fieldRegistry,
                ctx: {
                  layoutField: target.field,
                  req,
                  collection: config ?? null,
                  operation: 'update',
                  id: target.id,
                  data: { ...draft, [target.field]: layout, _status: 'published' },
                  originalDoc: draft,
                  overrideAccess: false,
                },
              }
            : undefined,
        })
        if (blocking.length > 0) {
          const errors: LiveError[] = describeLayoutErrors(layout, blocking, check.blocks, { localization })
          return { ok: false, status: 422, error: summarizeProblems({ blockIds: errors.map((e) => e.blockId), layoutDamaged: true }), errors }
        }
      }
      // A migrated document still has its old field: Publish keeps that field's published value.
      const legacy = action === 'publish' ? await publishedLegacyValues(payload, target, legacyFields) : {}
      doc = await payload.update({ ...save, data: { ...legacy, _status: action === 'publish' ? 'published' : 'draft' }, draft: false })
    }
    const event: LivePublishedEvent = {
      type: 'published',
      action,
      status: doc._status === 'published' ? 'published' : 'draft',
      at: new Date().toISOString(),
      ...(typeof doc.updatedAt === 'string' ? { updatedAt: doc.updatedAt } : {}),
      actor: requestActor(req.user),
    }
    runtime.sessions.broadcast(target.collection, target.id, event)
    return { ok: true, doc }
  } catch (error) {
    const status = statusOf(error)
    const code = status >= 400 && status < 600 ? status : 500
    const { errors, labels } = documentErrorsOf(error, fields, target.field)
    if (errors.length === 0) return { ok: false, status: code, error: payloadErrorMessage(error, target.field) }
    const layoutLines = errors.filter((e) => e.path === target.field).length
    const names = [...labels, ...(layoutLines > 0 ? ['the layout'] : [])]
    const summary = names.length > 0 ? summarizeProblems({ blockIds: [], fields: names }) : payloadErrorMessage(error, target.field)
    return { ok: false, status: code, error: summary, errors }
  }
}

/** The id of a related document, whether Payload returned it populated or not. */
const idOf = (value: unknown): string | null => {
  const id = value && typeof value === 'object' ? (value as { id?: unknown }).id : value
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null
}

/**
 * Restores an older version of the document, as the request's user. Payload's own Restore would
 * be overwritten by the open live session (the session owns the layout), so this works like
 * Revert: it resets the session to the version's layout (every editor reloads it), then restores
 * the version through the Local API. With drafts, the version becomes the new draft: the site
 * keeps its published version until someone publishes.
 */
export async function restoreDocumentVersion(
  req: PayloadRequest,
  { target, versionId, runtime }: { target: SessionTarget; versionId: string; runtime: LiveRuntime },
): Promise<ActionResult> {
  if (!(await runtime.canUpdate(req, target.collection, target.id))) {
    return { ok: false, status: 403, error: 'You are not allowed to change this document.' }
  }
  const payload = api(req)
  // The app's generated types narrow the slugs; the builder works with any collection.
  const collection = (req.payload.collections as Record<string, Collection | undefined>)[target.collection]
  if (!payload.findVersionByID || !collection) return { ok: false, status: 500, error: 'This collection cannot restore versions.' }
  const common = { collection: target.collection, depth: 0, overrideAccess: false, user: req.user, req }
  let version: Awaited<ReturnType<NonNullable<DocApi['findVersionByID']>>>
  try {
    // The stored layout: the session gets it and saves it, so props the user may not read stay in it.
    version = await payload.findVersionByID({ ...common, id: versionId, context: { [RAW_LAYOUT_CONTEXT]: true } })
  } catch (error) {
    return { ok: false, status: statusOf(error) === 403 ? 403 : 404, error: 'This version was not found.' }
  }
  if (idOf(version.parent) !== String(target.id)) return { ok: false, status: 404, error: 'This version belongs to another document.' }

  const before = runtime.sessions.peek(target.collection, target.id)?.layout
  await runtime.sessions.reset(target.collection, target.id, normalizeLayout(version.version?.[target.field]))
  try {
    // A plugin save: keep the document lock of someone in the settings drawer (fieldsGuard.ts).
    req.context = { ...req.context, [KEEP_LOCK_CONTEXT]: true, [STORED_LAYOUT_CONTEXT]: true }
    // The operation, not `payload.restoreVersion`: the Local API drops the `draft` flag (Payload
    // 3.90), and a restored published version would go live at once.
    const doc: Record<string, unknown> = await restoreVersionOperation({
      collection,
      id: versionId,
      depth: 0,
      draft: target.drafts,
      overrideAccess: false,
      req,
    })
    const event: LivePublishedEvent = {
      type: 'published',
      action: 'restore',
      status: doc._status === 'published' ? 'published' : 'draft',
      at: new Date().toISOString(),
      ...(typeof doc.updatedAt === 'string' ? { updatedAt: doc.updatedAt } : {}),
      actor: requestActor(req.user),
    }
    runtime.sessions.broadcast(target.collection, target.id, event)
    return { ok: true, doc }
  } catch (error) {
    // The document did not change: give the editors their layout back.
    if (before) await runtime.sessions.reset(target.collection, target.id, before)
    const status = statusOf(error)
    return { ok: false, status: status >= 400 && status < 600 ? status : 500, error: payloadErrorMessage(error, target.field) }
  }
}

export type DocumentEndpointOptions = {
  collections: Record<string, BuilderCollectionServer>
  /** Slug of the templates collection, when templates are on. */
  templates: string | null
  /** Slug of the saved sections collection, when it is a builder collection. */
  sections?: string | null
  runtime: LiveRuntime
  /** Publish validates the layout first and names each problem block. */
  check?: PublishCheck
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

export function documentEndpoints({ collections, templates, sections, runtime, check }: DocumentEndpointOptions): Endpoint[] {
  const access: FieldAccessArgs | undefined = check?.fieldRegistry ? { blocks: check.blocks, registry: check.fieldRegistry, runtime } : undefined
  const metaOf = async (req: PayloadRequest, target: SessionTarget) =>
    loadDocMeta(req, {
      target,
      url: collections[target.collection]?.url,
      isTemplate: target.collection === templates,
      isSection: Boolean(sections) && target.collection === sections,
      canUpdate: await runtime.canUpdate(req, target.collection, target.id),
      access,
    })

  // The editor asks again after edits to blocks with access rules (their data may change the answer).
  const accessEndpoint: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/access`,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies LiveAccessResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      if (!(await runtime.canUpdate(req, target.collection, target.id))) {
        return json({ ok: false, error: 'You are not allowed to change this document.' } satisfies LiveAccessResponse, 403)
      }
      try {
        const fieldAccess = access ? await loadFieldAccess(req, target, access) : null
        return json({ ok: true, fieldAccess } satisfies LiveAccessResponse)
      } catch (error) {
        return json({ ok: false, error: 'Document not found or not readable' } satisfies LiveAccessResponse, statusOf(error) === 403 ? 403 : 404)
      }
    },
  }

  const meta: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/meta`,
    method: 'get',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' }, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      try {
        return json(await metaOf(req, target))
      } catch (error) {
        return json({ ok: false, error: 'Document not found or not readable' }, statusOf(error) === 403 ? 403 : 404)
      }
    },
  }

  const action = (name: PublishAction): Endpoint => ({
    path: `${LIVE_PATH}/:collection/:id/${name}`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies PublishResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      const result = await runPublishAction(req, {
        target,
        action: name,
        runtime,
        check: check ? { ...check, localization: collections[target.collection]?.localization ?? null } : undefined,
        legacyFields: collections[target.collection]?.legacyFields,
      })
      if (!result.ok) {
        return json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) } satisfies PublishResponse, result.status)
      }
      return json({ ok: true, meta: await metaOf(req, target) } satisfies PublishResponse)
    },
  })

  const restore: Endpoint = {
    path: `${LIVE_PATH}/:collection/:id/restore`,
    method: 'post',
    handler: async (req) => {
      if (!req.user) return json({ ok: false, error: 'Unauthorized' } satisfies PublishResponse, 401)
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      try {
        await addDataAndFileToRequest(req)
      } catch {
        return json({ ok: false, error: 'The body must be JSON' } satisfies PublishResponse, 400)
      }
      const versionId = idOf((req.data as { versionId?: unknown } | undefined)?.versionId)
      if (!versionId) return json({ ok: false, error: '`versionId` is required.' } satisfies PublishResponse, 400)
      const result = await restoreDocumentVersion(req, { target, versionId, runtime })
      if (!result.ok) return json({ ok: false, error: result.error } satisfies PublishResponse, result.status)
      return json({ ok: true, meta: await metaOf(req, target) } satisfies PublishResponse)
    },
  }

  // The settings drawer takes Payload's document lock when it opens and gives it back when it
  // closes (see fieldsGuard.ts). The builder view itself never holds the lock.
  const holders = defaultSettingsLocks()
  const settingsLock = (method: 'post' | 'delete'): Endpoint => ({
    path: `${LIVE_PATH}/:collection/:id/settings-lock`,
    method,
    handler: async (req) => {
      const user = req.user as { id?: unknown; collection?: unknown } | null
      if (!user || (typeof user.id !== 'string' && typeof user.id !== 'number')) {
        return json({ ok: false, error: 'Unauthorized' } satisfies SettingsLockResponse, 401)
      }
      const target = targetOf(req, collections)
      if (target instanceof Response) return target
      const payload = req.payload as unknown as LockWritePayload & { db: { defaultIDType?: string } }
      // The lock row stores the id in the collection's id type.
      const id = payload.db.defaultIDType === 'number' && /^\d+$/.test(target.id) ? Number(target.id) : target.id
      const args = { payload, req, collection: target.collection, id, holders }
      try {
        if (method === 'delete') {
          await releaseSettingsLock({ ...args, user: { id: user.id } })
          return json({ ok: true, lock: 'released' } satisfies SettingsLockResponse)
        }
        if (!(await runtime.canUpdate(req, target.collection, target.id))) {
          return json({ ok: true, lock: 'off' } satisfies SettingsLockResponse)
        }
        const lock = await takeSettingsLock({ ...args, user: { id: user.id, collection: String(user.collection ?? 'users') } })
        return json({ ok: true, lock } satisfies SettingsLockResponse)
      } catch (error) {
        req.payload.logger.error({ err: error, msg: '[websiteBuilder] settings lock failed' })
        return json({ ok: false, error: 'The document lock could not be changed.' } satisfies SettingsLockResponse, 500)
      }
    },
  })

  return [meta, accessEndpoint, action('publish'), action('unpublish'), action('revert'), restore, settingsLock('post'), settingsLock('delete')]
}
