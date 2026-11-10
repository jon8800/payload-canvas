import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload, type CollectionSlug, type Payload } from 'payload'
import { cache } from 'react'

import { MAX_NOT_FOUND_ENTRIES, NOT_FOUND_LOG, NOT_FOUND_PRUNE_BATCH, nextNotFoundEntry, notFoundPath, notFoundReferrer } from './notFoundLog'

/**
 * Counts a 404 in the `not-found-log` collection, after the response is sent (`after`), so the 404
 * page is not slower. `MissingPage` calls it: the catch-all route sends every unknown URL there.
 * Not `not-found.tsx`: Next renders that boundary with every page, also pages that exist.
 * Prefetches do not count: a link on screen is not a visit.
 */
export async function recordNotFound(pathname?: string): Promise<void> {
  const list = await headers()
  if (list.get('next-router-prefetch') || list.get('purpose') === 'prefetch') return
  const path = notFoundPath(pathname ?? list.get('x-pathname'))
  if (path) countOnce(path, notFoundReferrer(list.get('referer')))
}

/** React `cache`: one call per path and request, whoever calls first. */
const countOnce = cache((path: string, referrer: string | null): void => {
  after(() => writeHit(path, referrer))
})

/**
 * Keeps the log under MAX_NOT_FOUND_ENTRIES: at the limit, removes the entries with the fewest hits,
 * oldest first. Runs only before a new path is added.
 */
async function makeRoom(payload: Payload, collection: CollectionSlug): Promise<void> {
  const { totalDocs } = await payload.count({ collection, overrideAccess: true })
  if (totalDocs < MAX_NOT_FOUND_ENTRIES) return
  const { docs } = await payload.find({ collection, sort: ['hits', 'lastSeen'], limit: NOT_FOUND_PRUNE_BATCH, depth: 0, pagination: false, overrideAccess: true })
  const ids = docs.map((doc) => doc.id)
  if (ids.length > 0) await payload.delete({ collection, where: { id: { in: ids } }, depth: 0, overrideAccess: true })
}

async function writeHit(path: string, referrer: string | null): Promise<void> {
  const payload = await getPayload({ config: configPromise })
  const collection = NOT_FOUND_LOG as CollectionSlug
  if (!payload.collections[collection]) return
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { docs } = await payload.find({ collection, where: { path: { equals: path } }, limit: 1, depth: 0, pagination: false, overrideAccess: true })
      const existing = docs[0] as unknown as { id: string | number; hits: number; lastReferrer?: string | null } | undefined
      const data = nextNotFoundEntry(existing ?? null, { path, referrer, now: new Date() })
      if (existing) {
        await payload.update({ collection, id: existing.id, data: data as never, depth: 0, overrideAccess: true })
        return
      }
      await makeRoom(payload, collection)
      try {
        await payload.create({ collection, data: data as never, depth: 0, overrideAccess: true })
        return
      } catch {
        // Another request created the path first (unique path): count this hit on its entry.
      }
    }
  } catch (error) {
    payload.logger.warn({ err: error, msg: `Could not log the 404 for ${path}` })
  }
}
