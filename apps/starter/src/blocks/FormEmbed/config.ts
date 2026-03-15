import type { Block } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { childrenField, settingsTab } from '@/blocks/shared'

export const FormEmbedBlock: Block = {
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
