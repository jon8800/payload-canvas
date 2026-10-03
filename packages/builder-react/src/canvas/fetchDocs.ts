import type { FetchDocs } from '../index'

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
