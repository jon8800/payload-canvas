// Maps documents to frontend paths. Safe on the server and in the client canvas.
import type { ResolveLink } from 'payload-canvas/react'

/** The page with this slug is served at "/". The site settings home page must use it too. */
export const HOME_SLUG = 'home'

/** Frontend path of a document, or null when the collection has no route. */
export function documentPath(collection: string, slug: unknown): string | null {
  if (typeof slug !== 'string' || !slug) return null
  if (collection === 'posts') return `/blog/${slug}`
  if (collection === 'pages') return slug === HOME_SLUG ? '/' : `/${slug}`
  return null
}

/**
 * Resolves a builder link group to an href, or null (the block renders without a link).
 * Reference links need the document loaded with its slug (the renderer loads it).
 */
export const resolveLink: ResolveLink = (link) => {
  if (link.type !== 'reference') return link.url?.trim() || null
  const doc = link.reference?.value
  if (!link.reference || typeof doc !== 'object' || doc === null) return null
  return documentPath(link.reference.relationTo, (doc as { slug?: unknown }).slug)
}
