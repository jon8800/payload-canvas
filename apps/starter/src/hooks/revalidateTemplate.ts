import { revalidatePath } from 'next/cache'
import type { CollectionAfterChangeHook } from 'payload'

/** A published template change reaches every document that renders through it. */
export const revalidateTemplate: CollectionAfterChangeHook = ({ doc, previousDoc, req: { payload, context } }) => {
  if (context.disableRevalidate) return doc
  // Draft saves (autosave) leave the published template unchanged.
  if (doc._status !== 'published') return doc
  if (doc.targetCollection === 'posts' || previousDoc?.targetCollection === 'posts') {
    payload.logger.info('Revalidating every post page (template changed)')
    revalidatePath('/blog/[slug]', 'page')
  }
  return doc
}
