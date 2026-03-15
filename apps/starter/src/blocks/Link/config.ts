import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { linkFields } from '@/fields/link'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const LinkBlock: RecursiveBlock = (children?: Field): Block => ({
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
          fields: [...linkFields, ...(children ? [children] : [])],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('span'),
      ],
    },
  ],
})
