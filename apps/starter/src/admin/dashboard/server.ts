import { getTranslation } from '@payloadcms/translations'
import type { CollectionSlug, GlobalSlug, PayloadRequest, SanitizedPermissions, WidgetServerProps } from 'payload'
import { builderViewPath, DEFAULT_COMMENTS_SLUG, layoutReferences, referencesConfigOf } from 'payload-canvas'
import { fieldReferences } from 'payload-canvas/core'

import { NOT_FOUND_LOG } from '@/lib/notFoundLog'
import { CONTENT_COLLECTIONS, docTitle, docURL, linkProblem, mayReference, relativeTime } from './lib'
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

/** Reads the whole stored layout (every locale), as the plugin's references code does. */
const RAW_LAYOUT = { builderRawLayout: true }

/** Collections that never point at content: Payload's own and the logs. */
const isInternal = (slug: string) => slug.startsWith('payload-') || slug === NOT_FOUND_LOG || slug === DEFAULT_COMMENTS_SLUG

/**
 * The ids of the `target` documents (for example media) that any collection or global uses: upload
 * and relationship fields, rich text, builder layouts (through the plugin's references field and
 * the layout JSON). Reads the published and the latest draft state, with full access, so a
 * document only some users can read still counts as a use.
 */
export async function referencedIds(req: PayloadRequest, target: string): Promise<Set<string>> {
  const { payload } = req
  const used = new Set<string>()
  const add = (fields: readonly unknown[], doc: Record<string, unknown>, self: boolean) => {
    for (const ref of fieldReferences(fields, doc)) {
      if (ref.relationTo !== target) continue
      // A document never uses itself.
      if (self && String(ref.value) === String(doc.id)) continue
      used.add(String(ref.value))
    }
  }
  const collections = Object.values(payload.collections)
    .map(({ config }) => config)
    .filter((config) => !isInternal(config.slug) && mayReference(config.fields, target))
  const globals = payload.config.globals.filter((config) => mayReference(config.fields, target))

  await Promise.all([
    ...collections.flatMap((config) =>
      (config.versions?.drafts ? [false, true] : [false]).map(async (draft) => {
        const result = await payload.find({
          collection: config.slug as CollectionSlug,
          context: RAW_LAYOUT,
          depth: 0,
          draft,
          overrideAccess: true,
          pagination: false,
          req,
        })
        for (const doc of result.docs as unknown as Array<Record<string, unknown>>) add(config.fields, doc, config.slug === target)
      }),
    ),
    ...globals.map(async (config) => {
      const doc = await payload.findGlobal({ slug: config.slug as GlobalSlug, depth: 0, draft: Boolean(config.versions?.drafts), overrideAccess: true, req })
      add(config.fields, doc as unknown as Record<string, unknown>, false)
    }),
  ])
  return used
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

type Id = string | number

/**
 * Links (and other references to documents, like a saved section) in builder layouts whose
 * document was deleted or is not published. Reads the layouts the user can read, in their latest
 * state (what the builder shows), with the plugin's reference collector. Images are left out:
 * the plugin refuses to delete an image a layout uses.
 */
export async function brokenLinks(req: PayloadRequest, permissions: SanitizedPermissions | undefined): Promise<BrokenLink[]> {
  const { payload } = req
  const config = referencesConfigOf(payload)
  if (!config) return []
  const isLinkTarget = (slug: string) => {
    const entry = payload.collections[slug as CollectionSlug]
    return Boolean(entry && !entry.config.upload)
  }

  const sources = await Promise.all(
    Object.entries(config.sources)
      .filter(([slug]) => can(req, permissions, slug))
      .map(async ([slug, source]) => {
        const result = await payload.find({
          collection: slug as CollectionSlug,
          context: RAW_LAYOUT,
          depth: 0,
          draft: source.drafts,
          overrideAccess: false,
          pagination: false,
          req,
        })
        return (result.docs as unknown as Array<Record<string, unknown>>).map((doc) => ({
          slug,
          source,
          doc,
          refs: (layoutReferences(config, slug, doc) ?? []).filter((ref) => isLinkTarget(ref.relationTo)),
        }))
      }),
  ).then((lists) => lists.flat())

  // The targets, one query per collection: are they there, and published?
  const wanted = new Map<string, Id[]>()
  for (const { refs } of sources) for (const ref of refs) wanted.set(ref.relationTo, [...(wanted.get(ref.relationTo) ?? []), ref.value])
  const targets = new Map<string, { status?: unknown; title: string }>()
  const checked = new Set<string>()
  await Promise.all(
    [...wanted].map(async ([slug, ids]) => {
      const { config: target } = payload.collections[slug as CollectionSlug]
      try {
        const result = await payload.find({
          collection: slug as CollectionSlug,
          depth: 0,
          draft: false,
          overrideAccess: true,
          pagination: false,
          req,
          where: { id: { in: [...new Set(ids.map(String))] } },
        })
        for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
          targets.set(`${slug}:${String(doc.id)}`, { status: doc._status, title: docTitle(doc, target.admin.useAsTitle) })
        }
        checked.add(slug)
      } catch {
        // A failed check reports nothing for this collection, rather than calling every link broken.
      }
    }),
  )

  const adminRoute = payload.config.routes.admin
  const links: BrokenLink[] = []
  for (const { slug, source, doc, refs } of sources) {
    for (const ref of refs) {
      if (!checked.has(ref.relationTo)) continue
      if (ref.relationTo === slug && String(ref.value) === String(doc.id)) continue
      const { config: target } = payload.collections[ref.relationTo as CollectionSlug]
      const found = targets.get(`${ref.relationTo}:${String(ref.value)}`)
      const problem = linkProblem({ found: Boolean(found), drafts: Boolean(target.versions?.drafts), status: found?.status })
      if (!problem) continue
      const label = getTranslation(target.labels.singular, req.i18n).toLowerCase()
      links.push({
        key: `${slug}:${String(doc.id)}:${ref.relationTo}:${String(ref.value)}`,
        href: builderViewPath(adminRoute, slug, doc.id as Id),
        title: docTitle(doc, source.title),
        detail: problem === 'deleted' ? `Links to a deleted ${label} (#${String(ref.value)})` : `Links to the unpublished ${label} “${found?.title}”`,
        problem,
      })
    }
  }
  return links
}
