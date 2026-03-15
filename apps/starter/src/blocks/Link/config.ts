import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { linkFields } from '@/fields/link'
import { childrenField, settingsTab } from '@/blocks/shared'

export const LinkBlock: Block = {
  slug: 'link',
  interfaceName: 'LinkBlock',
  labels: { singular: 'Link', plural: 'Links' },
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
          fields: [...linkFields, childrenField],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('span'),
      ],
    },
  ],
}
