import { notFound, redirect } from 'next/navigation'
import type { DocumentViewServerProps } from 'payload'

import { builderViewPath } from '../../plugin/links'

/**
 * The document view at `…/collections/:collection/:id/builder` (the old Builder tab URL and the
 * Builder tab's own path): sends the editor to the full-screen builder.
 */
export function BuilderRedirect({ initPageResult }: DocumentViewServerProps) {
  const { collectionConfig, docID, req } = initPageResult
  if (!collectionConfig || docID === undefined) notFound()
  redirect(builderViewPath(req.payload.config.routes.admin, collectionConfig.slug, docID))
}
