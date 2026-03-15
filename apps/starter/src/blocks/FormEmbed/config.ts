import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const FormEmbedBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'formEmbed',
  interfaceName: 'FormEmbedBlock',
  labels: { singular: 'Form Embed', plural: 'Form Embeds' },
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
              name: 'form',
              type: 'relationship',
              // 'forms' collection is dynamically created by the form-builder plugin
              relationTo: 'forms' as any,
              required: true,
              label: 'Select Form',
            },
            ...(children ? [children] : []),
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
})
