import type { Block, Field } from 'payload'
import { styleFields } from '@/fields/styleOptions'
import { settingsTab } from '@/blocks/shared'
import type { RecursiveBlock } from '@/blocks/generateBlocks'

export const ContainerBlock: RecursiveBlock = (children?: Field): Block => ({
  slug: 'container',
  interfaceName: 'ContainerBlock',
  labels: { singular: 'Container', plural: 'Containers' },
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
          fields: [...(children ? [children] : [])],
        },
        {
          label: 'Styles',
          fields: styleFields,
        },
        settingsTab('div', [
          {
            name: 'maxWidth',
            type: 'select',
            label: 'Max Width',
            defaultValue: 'none',
            options: [
              { label: 'None', value: 'none' },
              { label: 'SM', value: 'sm' },
              { label: 'MD', value: 'md' },
              { label: 'LG', value: 'lg' },
              { label: 'XL', value: 'xl' },
              { label: '2XL', value: '2xl' },
              { label: 'Full', value: 'full' },
            ],
          },
          {
            name: 'display',
            type: 'select',
            label: 'Display',
            defaultValue: 'block',
            options: [
              { label: 'Block', value: 'block' },
              { label: 'Flex', value: 'flex' },
              { label: 'Grid', value: 'grid' },
            ],
          },
          {
            name: 'flexDirection',
            type: 'select',
            label: 'Flex Direction',
            options: [
              { label: 'Row', value: 'row' },
              { label: 'Column', value: 'col' },
            ],
            admin: {
              condition: (_, siblingData) => siblingData?.display === 'flex',
            },
          },
          {
            name: 'alignItems',
            type: 'select',
            label: 'Align Items',
            options: [
              { label: 'Start', value: 'start' },
              { label: 'Center', value: 'center' },
              { label: 'End', value: 'end' },
              { label: 'Stretch', value: 'stretch' },
            ],
            admin: {
              condition: (_, siblingData) =>
                siblingData?.display === 'flex' || siblingData?.display === 'grid',
            },
          },
          {
            name: 'justifyContent',
            type: 'select',
            label: 'Justify Content',
            options: [
              { label: 'Start', value: 'start' },
              { label: 'Center', value: 'center' },
              { label: 'End', value: 'end' },
              { label: 'Between', value: 'between' },
              { label: 'Around', value: 'around' },
            ],
            admin: {
              condition: (_, siblingData) =>
                siblingData?.display === 'flex' || siblingData?.display === 'grid',
            },
          },
        ]),
      ],
    },
  ],
})
