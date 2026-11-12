import type { SharpCollectionConfig } from '@payloadcms/transformer-sharp'
import type { CollectionConfig } from 'payload'

import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import path from 'path'
import { fileURLToPath } from 'url'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    // The list is a grid (payload-media-gallery, in payload.config.ts). These columns are for the
    // table in upload pickers; the File Name column shows a thumbnail next to the name.
    defaultColumns: ['filename', 'alt', 'updatedAt'],
    useAsTitle: 'filename',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      //required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
  ],
  upload: {
    // Upload to the public/media directory in Next.js making them publicly accessible even outside of Payload
    staticDir: path.resolve(dirname, '../../public/media'),
    adminThumbnail: 'thumbnail',
  },
  versions: false,
  authorship: false,
}

/**
 * The image variants Payload 4's Sharp transformer makes for each upload (`variants` on the document).
 * The config registers them with `sharpTransformer({ collections: { media: mediaSharp } })`.
 */
export const mediaSharp: SharpCollectionConfig = {
  focalPoint: true,
  variants: [
    { name: 'thumbnail', width: 300 },
    { name: 'square', width: 500, height: 500 },
    { name: 'small', width: 600 },
    { name: 'medium', width: 900 },
    { name: 'large', width: 1400 },
    { name: 'xlarge', width: 1920 },
    { name: 'og', width: 1200, height: 630, crop: 'center' },
  ],
}
