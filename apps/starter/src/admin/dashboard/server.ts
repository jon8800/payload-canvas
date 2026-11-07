import { getTranslation } from '@payloadcms/translations'
import type { CollectionSlug, PayloadRequest, SanitizedPermissions, WidgetServerProps } from 'payload'

import { CONTENT_COLLECTIONS, docTitle, docURL, relativeTime } from './lib'
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
