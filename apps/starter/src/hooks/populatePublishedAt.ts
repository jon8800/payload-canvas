import type { CollectionBeforeChangeHook } from 'payload'

export const populatePublishedAt: CollectionBeforeChangeHook = ({
  data,
  operation,
}) => {
  if (operation === 'create' || operation === 'update') {
    if (data._status === 'published' && !data.publishedAt) {
      data.publishedAt = new Date().toISOString()
    }
  }

  return data
}
