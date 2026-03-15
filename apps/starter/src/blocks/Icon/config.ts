import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const IconBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'icon',
  interfaceName: 'IconBlock',
  labels: { singular: 'Icon', plural: 'Icons' },
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
              name: 'icon',
              type: 'upload',
              relationTo: 'media',
              label: 'Icon',
            },
            {
              name: 'name',
              type: 'text',
              label: 'Icon Name',
              admin: {
                description: 'Icon name for accessibility',
              },
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('span', [
          {
            name: 'size',
            type: 'select',
            label: 'Size',
            defaultValue: 'md',
            options: [
              { label: 'Small (16px)', value: 'sm' },
              { label: 'Medium (24px)', value: 'md' },
              { label: 'Large (32px)', value: 'lg' },
              { label: 'XL (48px)', value: 'xl' },
            ],
          },
        ]),
      ],
    },
  ],
})
