import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

/**
 * After a post is published or unpublished. Any page can show posts in a collection list (the
 * blog index, "latest posts" on the home page), and Payload's Local API gives Next no cache tags
 * to target those pages. So every cached page is marked stale: each renders again on its next visit.
 */

export const revalidatePost: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = `/blog/${doc.slug}`
      payload.logger.info(`Revalidating post at path: ${path}`)
      revalidatePath(path)
      revalidatePath('/', 'layout')
      revalidateTag('posts-sitemap', { expire: 0 })
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = `/blog/${previousDoc.slug}`
      payload.logger.info(`Revalidating old post at path: ${oldPath}`)
      revalidatePath(oldPath)
      revalidatePath('/', 'layout')
      revalidateTag('posts-sitemap', { expire: 0 })
    }
  }
  return doc
}
