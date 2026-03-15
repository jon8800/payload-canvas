import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const HeadingBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'heading',
  interfaceName: 'HeadingBlock',
  labels: { singular: 'Heading', plural: 'Headings' },
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
              name: 'text',
              type: 'text',
              required: true,
            },
            {
              name: 'tag',
              type: 'select',
              label: 'Heading Level',
              defaultValue: 'h2',
              options: [
                { label: 'H1', value: 'h1' },
                { label: 'H2', value: 'h2' },
                { label: 'H3', value: 'h3' },
                { label: 'H4', value: 'h4' },
                { label: 'H5', value: 'h5' },
                { label: 'H6', value: 'h6' },
              ],
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('header'),
      ],
    },
  ],
})
