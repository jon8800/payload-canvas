import configPromise from '@payload-config'
import { headers } from 'next/headers'
import { after } from 'next/server'
import { getPayload, type CollectionSlug } from 'payload'
import { cache } from 'react'

import { NOT_FOUND_LOG, nextNotFoundEntry, notFoundPath, notFoundReferrer } from './notFoundLog'

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
