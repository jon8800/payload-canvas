// Dev fixture: a site's Payload blocks field that the builder edits in place, the one source of
// truth (README: "Using existing Payload blocks"). Payload's editor and the builder read and write
// the same `layout` field: no second copy, nothing to migrate. Server only.
import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { rootSlugs } from './configs'
import { SHARED_BLOCKS_COLLECTION } from './enabled'

export const SharedBlocksPages: CollectionConfig = {
  slug: SHARED_BLOCKS_COLLECTION,
  labels: { singular: 'Shared blocks page', plural: 'Shared blocks pages' },
  access: { create: authenticated, delete: authenticated, read: authenticatedOrPublished, update: authenticated },
  admin: { useAsTitle: 'title', group: 'Dev fixtures', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
  versions: { drafts: { autosave: { interval: 375 } }, maxPerDoc: 25 },
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'layout', type: 'blocks', blockReferences: rootSlugs as never[], blocks: [] },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
  ],
}
