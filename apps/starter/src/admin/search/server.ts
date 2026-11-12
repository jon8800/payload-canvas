import { getTranslation } from '@payloadcms/translations'
import type { CollectionSlug, Endpoint, PayloadRequest, SanitizedCollectionConfig, Where } from 'payload'
import { formatAdminURL } from 'payload/shared'

import { SEARCH_EXCLUDE } from './config'
import { HITS_PER_GROUP, matchRank, MIN_QUERY_LENGTH, normaliseQuery, type AdminSearchGroup, type AdminSearchHit, type AdminSearchResponse } from './shared'

type Doc = Record<string, unknown> & { id: number | string }

/** One collection the search reads. */
export type SearchSource = {
  slug: CollectionSlug
  /** The collection's plural label, the group heading. */
  label: string
  /** `admin.useAsTitle`: the hit's title. */
  titleField: string
  /** The fields matched with Payload's `like` (every word, anywhere, any case). */
  fields: string[]
  /** Search the latest draft, so a page renamed but not yet published is found by its new title. */
  drafts: boolean
}

/** Rows read per group before ranking, so the best five are not cut off by the collection's sort. */
const CANDIDATES_PER_GROUP = 25

const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/**
 * The collections the search reads, from their own config: the same fields Payload's list view
 * searches (`admin.useAsTitle` plus `admin.listSearchableFields`). Hidden collections, the ones in
 * `SEARCH_EXCLUDE`, and collections titled only by their ID are left out.
 */
export function searchSources(
  collections: SanitizedCollectionConfig[],
  req: Pick<PayloadRequest, 'i18n' | 'user'>,
): SearchSource[] {
  return collections.flatMap((collection) => {
    if (SEARCH_EXCLUDE.includes(collection.slug)) return []
    const hidden = collection.admin?.hidden
    if (typeof hidden === 'function' ? hidden({ user: req.user as never }) : hidden) return []
    const titleField = collection.admin?.useAsTitle
    if (!titleField || titleField === 'id') return []
    const fields = [...new Set([titleField, ...(collection.admin?.listSearchableFields ?? [])])].filter((field) => field !== 'id')
    return [
      {
        slug: collection.slug as CollectionSlug,
        label: getTranslation(collection.labels.plural, req.i18n),
        titleField,
        fields,
        drafts: Boolean(collection.versions?.drafts),
      },
    ]
  })
}

/** The second line of a hit: the first other field that holds every word of the query. */
function subtitleOf(source: SearchSource, doc: Doc, title: string, query: string): string | undefined {
  const words = query.toLowerCase().split(' ')
  for (const field of source.fields) {
    if (field === source.titleField) continue
    const value = str(doc[field])
    if (value && value !== title && words.every((word) => value.toLowerCase().includes(word))) return value
  }
  return undefined
}

/**
 * Searches every source at once, as the signed-in user.
 *
 * `overrideAccess: false` with the request's user is the whole access story: each find runs the
 * collection's own read rules, so nobody finds a document they could not open. A collection the
 * user may not read makes Payload throw; that group is dropped and the rest still answer.
 * Groups come back best match first.
 */
export async function searchAdmin(req: PayloadRequest, rawQuery: string, sources = searchSources(req.payload.config.collections, req)): Promise<AdminSearchGroup[]> {
  const query = normaliseQuery(rawQuery)
  if (query.length < MIN_QUERY_LENGTH) return []
  const adminRoute = req.payload.config.routes.admin

  const groups = await Promise.all(
    sources.map(async (source) => {
      try {
        const where: Where = { or: source.fields.map((field) => ({ [field]: { like: query } })) }
        // Select the top-level field of each path (`aliases.value` selects `aliases`).
        const select = Object.fromEntries(source.fields.map((field) => [field.split('.')[0], true]))
        const { docs } = await req.payload.find({
          collection: source.slug,
          depth: 0,
          draft: source.drafts,
          limit: CANDIDATES_PER_GROUP,
          overrideAccess: false,
          pagination: false,
          req,
          select,
          where,
        })
        // A stable sort: equal ranks keep the collection's own order.
        const ranked = (docs as unknown as Doc[])
          .map((doc, index) => {
            const title = str(doc[source.titleField]) ?? `${source.label} ${doc.id}`
            const others = source.fields.filter((field) => field !== source.titleField).map((field) => str(doc[field]))
            return { doc, title, index, rank: matchRank(query, title, others) }
          })
          .toSorted((a, b) => a.rank - b.rank || a.index - b.index)
          .slice(0, HITS_PER_GROUP)
        if (!ranked.length) return null
        const hits = ranked.map(
          ({ doc, title }): AdminSearchHit => ({
            id: doc.id,
            title,
            subtitle: subtitleOf(source, doc, title, query),
            href: formatAdminURL({ adminRoute, path: `/collections/${source.slug}/${doc.id}` }),
          }),
        )
        return { group: { slug: source.slug, label: source.label, hits }, best: ranked[0].rank }
      } catch (error) {
        // Forbidden is the expected case (no read access). Anything else is worth a log line.
        if ((error as { status?: number }).status !== 403) {
          req.payload.logger.warn({ err: error, collection: source.slug }, 'admin search: collection query failed')
        }
        return null
      }
    }),
  )

  return groups
    .filter((entry) => entry !== null)
    .map((entry, index) => ({ ...entry, index }))
    .toSorted((a, b) => a.best - b.best || a.index - b.index)
    .map(({ group }) => group)
}

/**
 * `GET /api/admin-search?q=…`: every group in one round trip. Only users who may open the admin
 * (the admin user collection and its `access.admin`). Inside that, each collection answers with
 * its own read rules for this user. A GET, so Payload's CSRF check on cookie POSTs never applies.
 */
export const adminSearchEndpoint: Endpoint = {
  path: '/admin-search',
  method: 'get',
  handler: async (req) => {
    const adminCollection = req.payload.config.admin.user
    const adminAccess = req.payload.collections[adminCollection as CollectionSlug]?.config.access.admin
    const allowed = req.user?.collection === adminCollection && (!adminAccess || (await adminAccess({ req })))
    if (!allowed) return Response.json({ error: 'Forbidden' }, { status: 403 })

    const query = normaliseQuery(req.searchParams.get('q'))
    const body: AdminSearchResponse = { query, groups: await searchAdmin(req, query) }
    return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } })
  },
}
