import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { childrenField, settingsTab } from '@/blocks/shared'

export const ParagraphBlock: Block = {
  slug: 'paragraph',
  interfaceName: 'ParagraphBlock',
  labels: { singular: 'Paragraph', plural: 'Paragraphs' },
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
