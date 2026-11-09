import type { CollectionConfig } from 'payload'

import { adminOnly } from '../access/roles'
import { NOT_FOUND_LOG } from '../lib/notFoundLog'

/**
 * Paths visitors asked for that do not exist (404s), one entry per path with its number of hits.
 * The site writes it (src/lib/recordNotFound.ts); the "Broken links" dashboard widget reads it.
 * Only admins read and delete entries; nobody creates or edits them by hand.
 */
export const NotFoundLog: CollectionConfig = {
  slug: NOT_FOUND_LOG,
  labels: { singular: '404 entry', plural: '404 log' },
  access: {
    create: () => false,
    update: () => false,
    read: adminOnly,
    delete: adminOnly,
  },
  admin: {
    useAsTitle: 'path',
    defaultColumns: ['path', 'hits', 'lastSeen', 'lastReferrer'],
    description: 'Addresses visitors opened that do not exist. Add a redirect for the ones that matter, then delete them here.',
  },
  defaultSort: '-hits',
  fields: [
    { name: 'path', type: 'text', required: true, unique: true, index: true, admin: { readOnly: true } },
    { name: 'hits', type: 'number', required: true, defaultValue: 1, index: true, admin: { readOnly: true } },
    { name: 'lastSeen', label: 'Last seen', type: 'date', index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'lastReferrer', label: 'Last referrer', type: 'text', admin: { readOnly: true } },
  ],
}
