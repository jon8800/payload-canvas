import { getTranslation } from '@payloadcms/translations'
import type { CollectionSlug, PayloadRequest, SanitizedPermissions, Where, WidgetServerProps } from 'payload'
import { builderViewPath, referencesConfigOf } from 'payload-canvas'

import { REFERENCE_INDEX, referenceIndexReady, USES_FIELD } from '@/admin/references'
import { CONTENT_COLLECTIONS, docTitle, docURL, MEDIA_COLLECTION, relativeTime } from './lib'
import type { ListRow } from './WidgetCard'

export type WidgetProps = WidgetServerProps

/** True when the collection exists and the user may do `action` on it. */
export function can(
  req: PayloadRequest,
  permissions: SanitizedPermissions | undefined,
  slug: string,
  action: 'create' | 'read' | 'update' = 'read',
): slug is CollectionSlug {
  if (!req.payload.collections[slug as CollectionSlug]) return false
  return Boolean(permissions?.collections?.[slug]?.[action])
}

/** The content collections the user can read, with their singular label and title field. */
export function contentCollections(req: PayloadRequest, permissions: SanitizedPermissions | undefined) {
  return CONTENT_COLLECTIONS.filter((slug) => can(req, permissions, slug)).map((slug) => {
    const { config } = req.payload.collections[slug as CollectionSlug]
    return {
      slug: slug as CollectionSlug,
      label: getTranslation(config.labels.singular, req.i18n),
      useAsTitle: config.admin.useAsTitle,
      drafts: Boolean(config.versions?.drafts),
    }
  })
}

type ContentDoc = { id: string | number; updatedAt: string; _status?: string | null } & Record<string, unknown>

/**
 * The latest edited documents across the content collections, newest first.
 * `draftsOnly` keeps documents whose latest version is an unpublished draft.
 */
export async function latestDocuments(
  req: PayloadRequest,
  permissions: SanitizedPermissions | undefined,
  { limit, draftsOnly }: { limit: number; draftsOnly: boolean },
): Promise<ListRow[]> {
  const collections = contentCollections(req, permissions).filter((item) => !draftsOnly || item.drafts)
  const lists = await Promise.all(
    collections.map(async (collection) => {
      const result = await req.payload.find({
        collection: collection.slug,
        depth: 0,
        draft: true,
        limit,
        overrideAccess: false,
        pagination: false,
        req,
        sort: '-updatedAt',
        ...(draftsOnly ? { where: { _status: { equals: 'draft' } } } : {}),
      })
      return (result.docs as unknown as ContentDoc[]).map((doc) => ({ doc, collection }))
    }),
  )
  const adminRoute = req.payload.config.routes.admin
  return lists
    .flat()
    .toSorted((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
    .slice(0, limit)
    .map(({ doc, collection }) => ({
      key: `${collection.slug}-${doc.id}`,
      href: docURL(adminRoute, collection.slug, doc.id),
      title: docTitle(doc, collection.useAsTitle),
      meta: `${collection.label} · ${relativeTime(doc.updatedAt, new Date(), req.i18n.language)}`,
      ...(doc._status === 'draft' ? { badge: { label: 'Draft', tone: 'draft' as const } } : {}),
    }))
}

/** A number between `min` and `max` from widget settings, or the fallback. */
export function settingNumber(value: unknown, fallback: number, min = 1, max = 20): number {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

export type BrokenLink = {
  key: string
  /** The builder URL of the document with the link. */
  href: string
  title: string
  /** "Links to the deleted page #12". */
  detail: string
  problem: 'deleted' | 'unpublished'
}

type IndexRow = { id: string | number; sourceCollection: string; sourceId: string; sourceTitle?: string | null; relationTo: string; value: string; problem: string; targetTitle?: string | null }

/**
 * Links in builder layouts (the latest version, what the builder shows) to documents that were
 * deleted or are not published: one query on the reference index, at most `limit` rows plus the
 * total. Only layouts of collections the user can read. `null` until the index is built.
 * Images are left out: the plugin refuses to delete an image a layout uses.
 */
export async function brokenLinks(
  req: PayloadRequest,
  permissions: SanitizedPermissions | undefined,
  limit: number,
): Promise<{ links: BrokenLink[]; total: number } | null> {
  const { payload } = req
  if (!(await referenceIndexReady(payload))) return null
  const sources = Object.keys(referencesConfigOf(payload)?.sources ?? {}).filter((slug) => can(req, permissions, slug))
  if (!sources.length) return { links: [], total: 0 }
  const result = await payload.find({
    collection: REFERENCE_INDEX as CollectionSlug,
    depth: 0,
    limit,
    overrideAccess: true,
    req,
    sort: 'sourceTitle',
    where: { and: [{ problem: { exists: true } }, { latest: { equals: true } }, { layout: { equals: true } }, { sourceCollection: { in: sources } }] },
  })
  const adminRoute = payload.config.routes.admin
  const links = (result.docs as unknown as IndexRow[]).map((row): BrokenLink => {
    const target = payload.collections[row.relationTo as CollectionSlug]?.config
    const label = target ? getTranslation(target.labels.singular, req.i18n).toLowerCase() : row.relationTo
    const problem = row.problem === 'deleted' ? 'deleted' : 'unpublished'
    return {
      key: String(row.id),
      href: builderViewPath(adminRoute, row.sourceCollection, row.sourceId),
      title: row.sourceTitle || `Untitled (${row.sourceId})`,
      detail: problem === 'deleted' ? `Links to a deleted ${label} (#${row.value})` : `Links to the unpublished ${label} “${row.targetTitle ?? row.value}”`,
      problem,
    }
  })
  return { links, total: result.totalDocs }
}

export type MediaDoc = { id: string | number; filename?: string | null; alt?: string | null; createdAt: string; url?: unknown; thumbnailURL?: unknown; mimeType?: unknown; variants?: unknown }

/** Media no row of the reference index points at: no document or global uses them. */
const UNUSED_WHERE: Where = { [`${USES_FIELD}.id`]: { exists: false } }

/** The admin path of the full list of unused media (UnusedMediaView.tsx). */
export const UNUSED_MEDIA_PATH = '/unused-media'

/**
 * The newest `limit` files that nothing uses, and how many there are: one query (a join on the
 * reference index). Counts the published and the latest version of every document and global.
 * `null` until the index is built.
 */
export async function unusedMedia(req: PayloadRequest, limit: number, page = 1): Promise<{ docs: MediaDoc[]; total: number; pages: number } | null> {
  if (!(await referenceIndexReady(req.payload))) return null
  const result = await req.payload.find({
    collection: MEDIA_COLLECTION as CollectionSlug,
    depth: 0,
    limit,
    page,
    // The widget checks that the user can read media; the index itself is server-only.
    overrideAccess: true,
    req,
    sort: '-createdAt',
    where: UNUSED_WHERE,
  })
  return { docs: result.docs as unknown as MediaDoc[], total: result.totalDocs, pages: result.totalPages }
}
