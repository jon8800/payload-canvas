// The document behind the full-screen builder: what its top bar shows (title, status, dates,
// links) and the publish actions. Publishing goes through Payload's Local API as the signed-in
// user, so access control, hooks, versions and the CSS save hook all apply. While a session is
// open, the save-hook guard gives every save the session's layout.
//
//   GET  {api}/builder/live/:collection/:id/meta       -> BuilderDocMeta
//   POST {api}/builder/live/:collection/:id/publish    -> PublishResponse
//   POST {api}/builder/live/:collection/:id/unpublish  -> PublishResponse
//   POST {api}/builder/live/:collection/:id/revert     -> PublishResponse

import type { Endpoint, PayloadRequest } from 'payload'

import { TEMPLATE_PREVIEW_FIELD, TEMPLATE_TARGET_FIELD } from '../core/bindings'
import { describeLayoutErrors, summarizeProblems } from '../core/issues'
import { normalizeLayout } from '../core/tree'
import type { BlockDefinition } from '../core/types'
import { checkLayout, type BindingCheck } from '../plugin/hook'
import { documentPath, draftPreviewPath } from '../plugin/links'
import { payloadErrorMessage, payloadFieldErrors } from './apply'
import { LIVE_PATH, requestActor, targetOf } from './endpoints'
import type { LiveRuntime } from './runtime'
import type { SessionTarget } from './session'
import type { BuilderDocMeta, DocStatus, LiveError, LivePublishedEvent, PublishAction, PublishResponse } from './types'

/** One builder collection as the server sees it. */
export type BuilderCollectionServer = {
  /** Name of the layout field. */
  field: string
  /** Public path of a document (the plugin's `url` option). */
  url?: (doc: Record<string, unknown>) => string
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
  countVersions?(args: Record<string, unknown>): Promise<{ totalDocs: number }>
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
  canUpdate: boolean
}

/**
 * Reads the document as the request's user (throws Payload's NotFound or Forbidden) and returns
 * what the builder's top bar shows. The status follows Payload's own header: `changed` means
 * there is a published version and a newer draft.
 */
export async function loadDocMeta(req: PayloadRequest, args: DocMetaArgs): Promise<BuilderDocMeta> {
  const { target, url, isTemplate, canUpdate } = args
  const payload = api(req)
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
      ? { target: text(draft[TEMPLATE_TARGET_FIELD]), preview: draft[TEMPLATE_PREVIEW_FIELD] ?? null }
      : null,
  }
}

type ActionResult =
  | { ok: true; doc: Record<string, unknown> }
  | { ok: false; status: number; error: string; errors?: LiveError[] }

/** Block definitions and binding rules for the publish check. Without them, Payload's own errors only. */
export type PublishCheck = { blocks: readonly BlockDefinition[]; bindings?: BindingCheck }

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
  { target, action, runtime, check }: { target: SessionTarget; action: PublishAction; runtime: LiveRuntime; check?: PublishCheck },
): Promise<ActionResult> {
  if (!target.drafts) return { ok: false, status: 400, error: 'This collection has no drafts, so there is nothing to publish.' }
  if (!(await runtime.canUpdate(req, target.collection, target.id))) {
    return { ok: false, status: 403, error: 'You are not allowed to change this document.' }
  }
  const payload = api(req)
  const common = { collection: target.collection, id: target.id, depth: 0, overrideAccess: false, user: req.user, req }
  const fields = payload.collections[target.collection]?.config.fields
  try {
    let doc: Record<string, unknown>
    if (action === 'revert') {
      const published = await payload.findByID({ ...common, draft: false })
      if (published._status !== 'published') return { ok: false, status: 409, error: 'This document has no published version.' }
      await runtime.sessions.reset(target.collection, target.id, normalizeLayout(published[target.field]))
      const { id: _id, ...data } = published
      doc = await payload.update({ ...common, data: { ...data, _status: 'published' }, draft: false })
    } else {
      await runtime.sessions.flush(target.collection, target.id)
      if (action === 'publish' && check) {
        const draft = await payload.findByID({ ...common, draft: true })
        const layout = runtime.sessions.peek(target.collection, target.id)?.layout ?? normalizeLayout(draft[target.field])
        const { blocking } = checkLayout(layout, { blocks: check.blocks, publishing: true, bindings: check.bindings, doc: draft })
        if (blocking.length > 0) {
          const errors: LiveError[] = describeLayoutErrors(layout, blocking, check.blocks)
          return { ok: false, status: 422, error: summarizeProblems({ blockIds: errors.map((e) => e.blockId), layoutDamaged: true }), errors }
        }
      }
      doc = await payload.update({ ...common, data: { _status: action === 'publish' ? 'published' : 'draft' }, draft: false })
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

export type DocumentEndpointOptions = {
  collections: Record<string, BuilderCollectionServer>
  /** Slug of the templates collection, when templates are on. */
  templates: string | null
  runtime: LiveRuntime
  /** Publish validates the layout first and names each problem block. */
  check?: PublishCheck
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

export function documentEndpoints({ collections, templates, runtime, check }: DocumentEndpointOptions): Endpoint[] {
  const metaOf = async (req: PayloadRequest, target: SessionTarget) =>
    loadDocMeta(req, {
      target,
      url: collections[target.collection]?.url,
      isTemplate: target.collection === templates,
      canUpdate: await runtime.canUpdate(req, target.collection, target.id),
    })

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
      const result = await runPublishAction(req, { target, action: name, runtime, check })
      if (!result.ok) {
        return json({ ok: false, error: result.error, ...(result.errors ? { errors: result.errors } : {}) } satisfies PublishResponse, result.status)
      }
      return json({ ok: true, meta: await metaOf(req, target) } satisfies PublishResponse)
    },
  })

  return [meta, action('publish'), action('unpublish'), action('revert')]
}
