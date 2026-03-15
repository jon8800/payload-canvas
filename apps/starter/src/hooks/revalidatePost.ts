import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

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
      revalidatePath('/blog')
      revalidateTag('posts-sitemap', { expire: 0 })
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = `/blog/${previousDoc.slug}`
      payload.logger.info(`Revalidating old post at path: ${oldPath}`)
      revalidatePath(oldPath)
      revalidatePath('/blog')
      revalidateTag('posts-sitemap', { expire: 0 })
    }
  }
  return doc
}
