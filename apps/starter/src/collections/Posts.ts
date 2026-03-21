import type { BlockSlug, CollectionConfig } from 'payload'

import { allBlockSlugs } from '../blocks/registry'
import { authenticated } from '../access/authenticated'
import { authenticatedOrPublished } from '../access/authenticatedOrPublished'
import { populatePublishedAt } from '../hooks/populatePublishedAt'
import { revalidatePost } from '../hooks/revalidatePost'
import { compileBlockStyles } from '../hooks/compileBlockStyles'
import { generatePreviewPath } from '../utilities/generatePreviewPath'

export const Posts: CollectionConfig = {
  slug: 'posts',
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
          collection: 'posts',
          req,
        }),
    },
    preview: (data, { req }) =>
      generatePreviewPath({
        slug: typeof data?.slug === 'string' ? data.slug : '',
        collection: 'posts',
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
    afterChange: [revalidatePost, compileBlockStyles],
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
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      admin: { position: 'sidebar' },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      admin: { position: 'sidebar' },
    },
    {
      name: 'layout',
      type: 'blocks',
      blockReferences: [...allBlockSlugs] as BlockSlug[],
      blocks: [],
    },
    {
      name: '_compiledBlockCSS',
      type: 'textarea',
      admin: { hidden: true },
    },
  ],
}
