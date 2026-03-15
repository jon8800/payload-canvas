import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

export const revalidateTemplatePart: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      payload.logger.info(`Revalidating template part: ${doc.title}`)
      revalidatePath('/', 'layout')
      revalidateTag('pages-sitemap', { expire: 0 })
      revalidateTag('posts-sitemap', { expire: 0 })
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      payload.logger.info(`Revalidating layout after template part unpublished: ${doc.title}`)
      revalidatePath('/', 'layout')
    }
  }
  return doc
}
