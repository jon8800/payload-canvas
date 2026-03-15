import type { Block, Field } from 'payload'
import { stylesField } from '@/fields/stylesField'
import { linkFields } from '@/fields/link'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const ButtonBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'button',
  interfaceName: 'ButtonBlock',
  labels: { singular: 'Button', plural: 'Buttons' },
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
            ...linkFields,
            {
              name: 'variant',
              type: 'select',
              label: 'Variant',
              defaultValue: 'default',
              options: [
                { label: 'Default', value: 'default' },
                { label: 'Outline', value: 'outline' },
                { label: 'Ghost', value: 'ghost' },
                { label: 'Destructive', value: 'destructive' },
                { label: 'Secondary', value: 'secondary' },
                { label: 'Link', value: 'link' },
              ],
            },
            {
              name: 'size',
              type: 'select',
              label: 'Size',
              defaultValue: 'default',
              options: [
                { label: 'Small', value: 'sm' },
                { label: 'Default', value: 'default' },
                { label: 'Large', value: 'lg' },
                { label: 'Icon', value: 'icon' },
              ],
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: [stylesField()],
        },
        settingsTab('div'),
      ],
    },
  ],
})
