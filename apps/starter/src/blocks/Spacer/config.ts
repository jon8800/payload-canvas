import type { Block, Field } from 'payload'
import { stylesField } from '@/fields/stylesField'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const SpacerBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'spacer',
  interfaceName: 'SpacerBlock',
  labels: { singular: 'Spacer', plural: 'Spacers' },
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
          fields: [...(children ? [children] : [])],
        },
        {
          label: 'Styles',
          fields: [stylesField()],
        },
        settingsTab('div', [
          {
            name: 'height',
            type: 'select',
            label: 'Height',
            defaultValue: 'md',
            options: [
              { label: 'XS (h-2)', value: 'xs' },
              { label: 'SM (h-4)', value: 'sm' },
              { label: 'MD (h-8)', value: 'md' },
              { label: 'LG (h-12)', value: 'lg' },
              { label: 'XL (h-16)', value: 'xl' },
              { label: '2XL (h-24)', value: '2xl' },
            ],
          },
        ]),
      ],
    },
  ],
})
