import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const GridBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'grid',
  interfaceName: 'GridBlock',
  labels: { singular: 'Grid', plural: 'Grids' },
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
          fields: styleFields,
        },
        settingsTab('div', [
          {
            name: 'columns',
            type: 'number',
            label: 'Columns',
            defaultValue: 2,
            min: 1,
            max: 12,
          },
          {
            name: 'gap',
            type: 'select',
            label: 'Gap',
            defaultValue: 'md',
            options: [
              { label: 'None', value: 'none' },
              { label: 'XS', value: 'xs' },
              { label: 'SM', value: 'sm' },
              { label: 'MD', value: 'md' },
              { label: 'LG', value: 'lg' },
              { label: 'XL', value: 'xl' },
            ],
          },
        ]),
      ],
    },
  ],
})
