// Creates the demo site's editable classes (src/data/classes.ts) as published classes.
// Safe to run again: a class that exists (by name) stays as it is, so an editor's changes are kept.
import type { Payload, RequestContext } from 'payload'

import { siteClasses } from '@/data/classes'

export async function seedClasses(payload: Payload, context: RequestContext = {}) {
  const created: string[] = []
  const kept: string[] = []
  for (const item of siteClasses) {
    const found = await payload.find({
      collection: 'builder-classes',
      where: { name: { equals: item.name } },
      draft: true,
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (found.docs.length > 0) {
      kept.push(item.name)
      continue
    }
    // Each publish compiles the classes stylesheet again (the collection's hook).
    await payload.create({ collection: 'builder-classes', data: { ...item, _status: 'published' }, context, overrideAccess: true })
    created.push(item.name)
  }
  payload.logger.info(`Classes: created ${created.join(', ') || 'none'}; kept ${kept.join(', ') || 'none'}.`)
}
