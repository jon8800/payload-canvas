import type { CollectionConfig, Plugin } from 'payload'

const STATUS_CELL = '/admin/list/StatusCell#StatusCell'

function hasDrafts(collection: CollectionConfig): boolean {
  return Boolean(collection.versions && typeof collection.versions === 'object' && collection.versions.drafts)
}

/**
 * Shows the Status column of every collection with drafts as a coloured badge (StatusCell.tsx).
 *
 * Payload adds the `_status` field itself. A field with the same name in the collection is merged
 * into Payload's field, so this one only adds the list cell: the options, default and database
 * column stay Payload's own. It must run after the plugins that add collections with drafts
 * (websiteBuilder adds Templates and Classes). It adds a field at the end and moves nothing, so the
 * builder's layout field stays top-level.
 */
export function statusBadges(): Plugin {
  return (config) => ({
    ...config,
    collections: config.collections?.map((collection) =>
      hasDrafts(collection)
        ? {
            ...collection,
            fields: [
              ...collection.fields,
              // `options: []` keeps Payload's options: the merge adds arrays together.
              {
                name: '_status',
                type: 'select',
                // Payload labels this field from its name before the merge, so the column would read "_status".
                label: ({ t }) => t('version:status'),
                options: [],
                admin: { components: { Cell: STATUS_CELL } },
              },
            ],
          }
        : collection,
    ),
  })
}
