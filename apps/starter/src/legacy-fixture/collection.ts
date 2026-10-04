// Dev fixture: a pages collection as a site that predates the builder has it. The old content
// lives in the `layout` blocks field (inside an unnamed tab); the builder gets its own field,
// `builderLayout` (see payload.config.ts). Server only.
import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { LEGACY_COLLECTION } from './enabled'
import { rootSlugs } from './configs'

export const LegacyPages: CollectionConfig = {
  slug: LEGACY_COLLECTION,
  labels: { singular: 'Legacy page', plural: 'Legacy pages' },
  access: { create: authenticated, delete: authenticated, read: authenticatedOrPublished, update: authenticated },
  admin: { useAsTitle: 'title', group: 'Dev fixtures', defaultColumns: ['title', 'slug', '_status', 'updatedAt'] },
  versions: { drafts: { autosave: { interval: 375 } }, maxPerDoc: 25 },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'layout', type: 'blocks', blockReferences: rootSlugs as never[], blocks: [] },
          ],
        },
      ],
    },
    { name: 'slug', type: 'text', required: true, unique: true, index: true, admin: { position: 'sidebar' } },
  ],
}
