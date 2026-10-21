import type { FetchDocs, ListQuery } from '../index'
import { arrangeListDocs, listRequest } from '../render/lists'

type Doc = Record<string, unknown>

/** One promise per document, shared by every layout render. Key: api + locale + collection + id. */
const cache = new Map<string, Promise<Doc | null>>()

/**
 * Payload's REST `locale` parameter: documents load in the editor's locale with the config's
 * fallback, as the site's Local API reads do. Nothing without a locale.
 */
function withLocale(params: URLSearchParams, locale: string | null | undefined): URLSearchParams {
  if (locale) params.set('locale', locale)
  return params
}

/**
 * Loads documents over Payload's REST API, one request per collection for the missing ids, in
 * `locale` (the editor's locale). Results are cached for the life of the iframe. A failed request
 * is not cached.
 */
export function createRestFetchDocs(api: string, locale?: string | null): FetchDocs {
  const keyOf = (collection: string, id: string | number) => `${api}\u0000${locale ?? ''}\u0000${collection}\u0000${id}`
  return async (collection, ids) => {
    const missing = [...new Set(ids)].filter((id) => !cache.has(keyOf(collection, id)))
    if (missing.length > 0) {
      const params = withLocale(new URLSearchParams({ depth: '0', draft: 'true', limit: String(missing.length) }), locale)
      missing.forEach((id, i) => params.set(`where[id][in][${i}]`, String(id)))
      const request = fetch(`${api}/${encodeURIComponent(collection)}?${params}`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          const body = (await res.json()) as { docs?: Doc[] }
          return new Map((body.docs ?? []).map((doc) => [String(doc.id), doc]))
        })
        .catch(() => {
          for (const id of missing) cache.delete(keyOf(collection, id))
          return new Map<string, Doc>()
        })
      for (const id of missing) {
        cache.set(
          keyOf(collection, id),
          request.then((docs) => docs.get(String(id)) ?? null),
        )
      }
    }

    const result = new Map<string | number, Doc>()
    await Promise.all(
      ids.map(async (id) => {
        const doc = await cache.get(keyOf(collection, id))
        if (doc) result.set(id, doc)
      }),
    )
    return result
  }
}

/** One promise per list query. Key: api + locale + collection + limit + sort + depth + where. */
const listCache = new Map<string, Promise<{ docs: Doc[]; totalPages: number }>>()

/**
 * Payload's REST bracket query for a `where`, e.g. `where[and][0][services][in][0]=5`, as
 * `[name, value]` pairs. Arrays and objects nest; other values become strings.
 */
export function whereParams(value: unknown, prefix = 'where'): Array<[string, string]> {
  if (value === undefined || value === null) return []
  if (typeof value !== 'object') return [[prefix, String(value)]]
  return Object.entries(value).flatMap(([key, inner]) => whereParams(inner, `${prefix}[${key}]`))
}

/**
 * Loads a collection list's documents over REST (`depth=1`, latest drafts, in `locale`), cached
 * for the life of the iframe. The page's own document is filtered out here, so one request serves
 * every page. The query's `where` goes along as Payload's bracket query. A filter that matches
 * nothing (`none`) loads nothing.
 */
export function fetchListItems(api: string, query: ListQuery, locale?: string | null, seed = 0): Promise<Doc[]> {
  return fetchListPage(api, query, locale, seed).then((result) => result.docs)
}

/**
 * `fetchListItems` with the number of pages Payload reports (for a paginated list's page links).
 * Picked ids keep their order, and `$random` lists shuffle with `seed`.
 */
export function fetchListPage(api: string, query: ListQuery, locale?: string | null, seed = 0): Promise<{ docs: Doc[]; totalPages: number }> {
  if (query.none) return Promise.resolve({ docs: [], totalPages: 0 })
  const wanted = listRequest(query)
  const limit = wanted.limit + (query.exclude === undefined ? 0 : 1)
  const depth = String(query.depth ?? 1)
  const where = whereParams(query.ids ? (query.where ? { and: [{ id: { in: query.ids } }, query.where] } : { id: { in: query.ids } }) : query.where)
  const page = wanted.page ? String(wanted.page) : ''
  const key = `${api}\u0000${locale ?? ''}\u0000${query.collection}\u0000${limit}\u0000${wanted.sort}\u0000${depth}\u0000${JSON.stringify(where)}\u0000${page}`
  let request = listCache.get(key)
  if (!request) {
    const params = withLocale(new URLSearchParams({ limit: String(limit), sort: wanted.sort, depth, draft: 'true' }), locale)
    if (page) params.set('page', page)
    for (const [name, value] of where) params.append(name, value)
    request = fetch(`${api}/${encodeURIComponent(query.collection)}?${params}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const body = (await res.json()) as { docs?: Doc[]; totalPages?: number }
        return { docs: body.docs ?? [], totalPages: body.totalPages ?? 1 }
      })
      .catch(() => {
        listCache.delete(key)
        return { docs: [], totalPages: 0 }
      })
    listCache.set(key, request)
  }
  return request.then((result) => ({
    docs: arrangeListDocs(
      result.docs.filter((doc) => query.exclude === undefined || String(doc.id) !== String(query.exclude)),
      query,
      seed,
    ),
    totalPages: result.totalPages,
  }))
}

/**
 * Drops a document from the cache (every locale) and the list results of its collection, so the
 * next layout render loads them again. Used when the editor changed a document outside the layout.
 */
export function forgetDoc(collection: string, id: string | number) {
  const suffix = `\u0000${collection}\u0000${id}`
  for (const key of cache.keys()) if (key.endsWith(suffix)) cache.delete(key)
  for (const key of listCache.keys()) if (key.split('\u0000')[2] === collection) listCache.delete(key)
}
