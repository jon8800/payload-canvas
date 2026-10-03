import { revalidatePath, revalidateTag } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'
import { documentPath } from '../lib/links'

export const revalidatePage: CollectionAfterChangeHook = ({
  doc,
  previousDoc,
  req: { payload, context },
}) => {
  if (!context.disableRevalidate) {
    if (doc._status === 'published') {
      const path = documentPath('pages', doc.slug) ?? '/'
      payload.logger.info(`Revalidating page at path: ${path}`)
      revalidatePath(path)
      revalidateTag('pages-sitemap', { expire: 0 })
    }

    if (previousDoc?._status === 'published' && doc._status !== 'published') {
      const oldPath = documentPath('pages', previousDoc.slug) ?? '/'
      payload.logger.info(`Revalidating old page at path: ${oldPath}`)
      revalidatePath(oldPath)
      revalidateTag('pages-sitemap', { expire: 0 })
    }
  }
  return doc
}
