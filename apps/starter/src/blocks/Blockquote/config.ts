import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const BlockquoteBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'blockquote',
  interfaceName: 'BlockquoteBlock',
  labels: { singular: 'Blockquote', plural: 'Blockquotes' },
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
              name: 'content',
              type: 'richText',
            },
            {
              name: 'citation',
              type: 'text',
              label: 'Citation',
            },
            ...(children ? [children] : []),
          ],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('blockquote'),
      ],
    },
  ],
})
