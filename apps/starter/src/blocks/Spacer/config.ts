import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { childrenField, settingsTab } from '@/blocks/shared'

export const SpacerBlock: Block = {
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
          fields: [childrenField],
        },
        {
          label: 'Styles',
          fields: styleFields,
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
}
