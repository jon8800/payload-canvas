import type { Block, Field } from 'payload'
import { stylesField } from '@/fields/stylesField'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const ParagraphBlock: RecursiveBlock = (children?: Field): Block => ({
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
