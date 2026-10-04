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
import { normalizeLayout } from '../core/tree'
import { documentPath, draftPreviewPath } from '../plugin/links'
import { LIVE_PATH, requestActor, targetOf } from './endpoints'
import type { LiveRuntime } from './runtime'
import type { SessionTarget } from './session'
import type { BuilderDocMeta, DocStatus, LivePublishedEvent, PublishAction, PublishResponse } from './types'

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
  collections: Record<string, { config: { admin?: { useAsTitle?: string }; versions?: unknown } } | undefined>
}

const api = (req: PayloadRequest) => req.payload as unknown as DocApi

const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null)

/** The error message of a failed Payload call, with the field messages of a ValidationError. */
export function payloadErrorMessage(error: unknown): string {
  const data = (error as { data?: { errors?: { message?: unknown }[] } })?.data
  const details = (data?.errors ?? []).map((e) => e.message).filter((m): m is string => typeof m === 'string' && m !== '')
  if (details.length > 0) return details.join('\n')
  return error instanceof Error ? error.message : String(error)
}

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

type ActionResult = { ok: true; doc: Record<string, unknown> } | { ok: false; status: number; error: string }

/**
 * Publish, unpublish or revert, as the request's user. Publish saves the session's unsaved
 * commits first, so no older draft lands after the published version. Revert resets the open
 * session to the published layout (every editor reloads), then saves the published data again,
 * the same way Payload's own "Revert to published" does.
 */
export async function runPublishAction(
  req: PayloadRequest,
  { target, action, runtime }: { target: SessionTarget; action: PublishAction; runtime: LiveRuntime },
): Promise<ActionResult> {
  if (!target.drafts) return { ok: false, status: 400, error: 'This collection has no drafts, so there is nothing to publish.' }
  if (!(await runtime.canUpdate(req, target.collection, target.id))) {
    return { ok: false, status: 403, error: 'You are not allowed to change this document.' }
  }
  const payload = api(req)
  const common = { collection: target.collection, id: target.id, depth: 0, overrideAccess: false, user: req.user, req }
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
    return { ok: false, status: status >= 400 && status < 600 ? status : 500, error: payloadErrorMessage(error) }
  }
}

export type DocumentEndpointOptions = {
  collections: Record<string, BuilderCollectionServer>
  /** Slug of the templates collection, when templates are on. */
  templates: string | null
  runtime: LiveRuntime
}

const json = (body: unknown, status = 200) => Response.json(body, { status })

export function documentEndpoints({ collections, templates, runtime }: DocumentEndpointOptions): Endpoint[] {
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
      const result = await runPublishAction(req, { target, action: name, runtime })
      if (!result.ok) return json({ ok: false, error: result.error } satisfies PublishResponse, result.status)
      return json({ ok: true, meta: await metaOf(req, target) } satisfies PublishResponse)
    },
  })

  return [meta, action('publish'), action('unpublish'), action('revert')]
}
