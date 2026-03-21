import type { BlockSlug, CollectionConfig } from 'payload'

import { allBlockSlugs } from '../blocks/registry'
import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { populatePublishedAt } from '../hooks/populatePublishedAt'
import { revalidatePage } from '../hooks/revalidatePage'
import { compileBlockStyles } from '../hooks/compileBlockStyles'
import { generatePreviewPath } from '../utilities/generatePreviewPath'

export const Pages: CollectionConfig = {
  slug: 'pages',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticatedOrPublished,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['title', 'slug', 'updatedAt'],
    useAsTitle: 'title',
    livePreview: {
      url: ({ data, req }) =>
        generatePreviewPath({
          slug: typeof data?.slug === 'string' ? data.slug : '',
          collection: 'pages',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'pages',
        req,
      }),
    components: {
      views: {
        edit: {
          customiser: {
            Component: '@/views/customiser/index#CustomiserView',
            path: '/customiser',
            tab: {
              href: '/customiser',
              label: 'Customiser',
            },
          },
        },
      },
    },
  },
  versions: {
    maxPerDoc: 50,
    drafts: {
      autosave: { interval: 300 },
      schedulePublish: true,
    },
  },
  trash: true,
  enableQueryPresets: true,
  hooks: {
    afterChange: [revalidatePage, compileBlockStyles],
    beforeChange: [populatePublishedAt],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: [...allBlockSlugs] as BlockSlug[],
      blocks: [],
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: '_compiledBlockCSS',
      type: 'textarea',
      admin: { hidden: true },
    },
  ],
}
