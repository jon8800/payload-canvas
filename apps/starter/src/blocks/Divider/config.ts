import type { Block, Field } from 'payload'
import { stylesField } from '@/fields/stylesField'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const DividerBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'divider',
  interfaceName: 'DividerBlock',
  labels: { singular: 'Divider', plural: 'Dividers' },
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
            name: 'style',
            type: 'select',
            label: 'Style',
            defaultValue: 'solid',
            options: [
              { label: 'Solid', value: 'solid' },
              { label: 'Dashed', value: 'dashed' },
              { label: 'Dotted', value: 'dotted' },
            ],
          },
          {
            name: 'thickness',
            type: 'select',
            label: 'Thickness',
            defaultValue: 'normal',
            options: [
              { label: 'Thin (1px)', value: 'thin' },
              { label: 'Normal (2px)', value: 'normal' },
              { label: 'Thick (4px)', value: 'thick' },
            ],
          },
          {
            name: 'color',
            type: 'select',
            label: 'Color',
            options: [
              { label: 'None', value: 'none' },
              { label: 'Primary', value: 'primary' },
              { label: 'Secondary', value: 'secondary' },
              { label: 'Muted', value: 'muted' },
              { label: 'Accent', value: 'accent' },
              { label: 'Destructive', value: 'destructive' },
              { label: 'Background', value: 'background' },
              { label: 'Foreground', value: 'foreground' },
              { label: 'Card', value: 'card' },
              { label: 'Popover', value: 'popover' },
            ],
          },
        ]),
      ],
    },
  ],
})
