import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { childrenField, settingsTab } from '@/blocks/shared'

export const VideoBlock: Block = {
  slug: 'video',
  interfaceName: 'VideoBlock',
  labels: { singular: 'Video', plural: 'Videos' },
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
              name: 'source',
              type: 'select',
              label: 'Source',
              defaultValue: 'upload',
              options: [
                { label: 'Upload', value: 'upload' },
                { label: 'External URL', value: 'external' },
              ],
            },
            {
              name: 'video',
              type: 'upload',
              relationTo: 'media',
              admin: {
                condition: (_, siblingData) => siblingData?.source === 'upload',
              },
            },
            {
              name: 'url',
              type: 'text',
              label: 'External URL',
              admin: {
                condition: (_, siblingData) => siblingData?.source === 'external',
                description: 'Full URL to the video (e.g. YouTube, Vimeo)',
              },
            },
            {
              name: 'poster',
              type: 'upload',
              relationTo: 'media',
              label: 'Poster Image',
            },
            childrenField,
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('figure', [
          {
            name: 'autoplay',
            type: 'checkbox',
            label: 'Autoplay',
            defaultValue: false,
          },
          {
            name: 'loop',
            type: 'checkbox',
            label: 'Loop',
          },
          {
            name: 'muted',
            type: 'checkbox',
            label: 'Muted',
            defaultValue: true,
          },
          {
            name: 'controls',
            type: 'checkbox',
            label: 'Show Controls',
            defaultValue: true,
          },
        ]),
      ],
    },
  ],
}
