import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { childrenField, settingsTab } from '@/blocks/shared'

export const BlockquoteBlock: Block = {
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
            childrenField,
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
}
