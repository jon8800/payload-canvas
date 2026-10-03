import type { FetchDocs, ListQuery } from '../index'

type Doc = Record<string, unknown>

/** One promise per document, shared by every layout render. Key: api + collection + id. */
const cache = new Map<string, Promise<Doc | null>>()

const keyOf = (api: string, collection: string, id: string | number) => `${api}\u0000${collection}\u0000${id}`

/**
 * Loads documents over Payload's REST API, one request per collection for the missing ids.
 * Results are cached for the life of the iframe. A failed request is not cached.
 */
export function createRestFetchDocs(api: string): FetchDocs {
  return async (collection, ids) => {
    const missing = [...new Set(ids)].filter((id) => !cache.has(keyOf(api, collection, id)))
    if (missing.length > 0) {
      const params = new URLSearchParams({ depth: '0', draft: 'true', limit: String(missing.length) })
      missing.forEach((id, i) => params.set(`where[id][in][${i}]`, String(id)))
      const request = fetch(`${api}/${encodeURIComponent(collection)}?${params}`, { credentials: 'include' })
        .then(async (res) => {
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          const body = (await res.json()) as { docs?: Doc[] }
          return new Map((body.docs ?? []).map((doc) => [String(doc.id), doc]))
        })
        .catch(() => {
          for (const id of missing) cache.delete(keyOf(api, collection, id))
          return new Map<string, Doc>()
        })
      for (const id of missing) {
        cache.set(
          keyOf(api, collection, id),
          request.then((docs) => docs.get(String(id)) ?? null),
        )
      }
    }

    const result = new Map<string | number, Doc>()
    await Promise.all(
      ids.map(async (id) => {
        const doc = await cache.get(keyOf(api, collection, id))
        if (doc) result.set(id, doc)
      }),
    )
    return result
  }
}

/** One promise per list query. Key: api + collection + limit + sort. */
const listCache = new Map<string, Promise<Doc[]>>()

/**
 * Loads a collection list's documents over REST (`depth=1`, latest drafts), cached for the life
 * of the iframe. The page's own document is filtered out here, so one request serves every page.
 */
export function fetchListItems(api: string, query: ListQuery): Promise<Doc[]> {
  const limit = query.limit + (query.exclude === undefined ? 0 : 1)
  const key = `${api}\u0000${query.collection}\u0000${limit}\u0000${query.sort}`
  let request = listCache.get(key)
  if (!request) {
    const params = new URLSearchParams({ limit: String(limit), sort: query.sort, depth: '1', draft: 'true' })
    request = fetch(`${api}/${encodeURIComponent(query.collection)}?${params}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const body = (await res.json()) as { docs?: Doc[] }
        return body.docs ?? []
      })
      .catch(() => {
        listCache.delete(key)
        return []
      })
    listCache.set(key, request)
  }
  return request.then((docs) =>
    docs.filter((doc) => query.exclude === undefined || String(doc.id) !== String(query.exclude)).slice(0, query.limit),
  )
}
