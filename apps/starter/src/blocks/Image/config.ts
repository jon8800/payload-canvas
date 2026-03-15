import type { Block, Field } from 'payload'
import { stylesField } from '@/fields/stylesField'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const ImageBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'image',
  interfaceName: 'ImageBlock',
  labels: { singular: 'Image', plural: 'Images' },
  admin: {
    disableBlockName: true,
    components: {
      Label: '/components/admin/BlockRowLabel.tsx#BlockRowLabel',
    },
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            {
              name: 'image',
              type: 'upload',
              relationTo: 'media',
              required: true,
            },
            {
              name: 'alt',
              type: 'text',
              label: 'Alt Text',
            },
            {
              name: 'caption',
              type: 'text',
              label: 'Caption',
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: [stylesField()],
        },
        settingsTab('figure', [
          {
            name: 'objectFit',
            type: 'select',
            label: 'Object Fit',
            defaultValue: 'cover',
            options: [
              { label: 'Cover', value: 'cover' },
              { label: 'Contain', value: 'contain' },
              { label: 'Fill', value: 'fill' },
              { label: 'None', value: 'none' },
            ],
          },
          {
            name: 'aspectRatio',
            type: 'select',
            label: 'Aspect Ratio',
            options: [
              { label: 'Auto', value: 'auto' },
              { label: '1:1', value: '1/1' },
              { label: '4:3', value: '4/3' },
              { label: '16:9', value: '16/9' },
              { label: '3:2', value: '3/2' },
            ],
          },
        ]),
      ],
    },
  ],
})
