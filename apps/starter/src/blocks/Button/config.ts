import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { linkFields } from '@/fields/link'
import { childrenField, settingsTab } from '@/blocks/shared'

export const ButtonBlock: Block = {
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
            childrenField,
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
}
