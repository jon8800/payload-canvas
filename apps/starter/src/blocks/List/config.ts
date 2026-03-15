import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const ListBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'list',
  interfaceName: 'ListBlock',
  labels: { singular: 'List', plural: 'Lists' },
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
              name: 'items',
              type: 'array',
              label: 'List Items',
              fields: [
                {
                  name: 'text',
                  type: 'text',
                  required: true,
                },
              ],
            },
            {
              name: 'listType',
              type: 'select',
              label: 'List Type',
              defaultValue: 'unordered',
              options: [
                { label: 'Unordered', value: 'unordered' },
                { label: 'Ordered', value: 'ordered' },
              ],
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('div'),
      ],
    },
  ],
})
