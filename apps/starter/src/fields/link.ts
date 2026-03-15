import type { Field } from 'payload'

// Reusable link field group for Button and Link blocks
// Provides consistent link handling across all action blocks
export const linkFields: Field[] = [
  {
    name: 'type',
    type: 'select',
    label: 'Link Type',
    defaultValue: 'internal',
    options: [
      { label: 'Internal', value: 'internal' },
      { label: 'External', value: 'external' },
    ],
    required: true,
  },
  {
    name: 'url',
    type: 'text',
    label: 'URL',
    required: true,
    admin: {
      condition: (_, siblingData) => siblingData?.type === 'external',
      description: 'Full URL including https://',
    },
  },
  {
    name: 'reference',
    type: 'relationship',
    relationTo: ['pages', 'posts'],
    label: 'Document to link to',
    required: true,
    admin: {
      condition: (_, siblingData) => siblingData?.type === 'internal',
    },
  },
  {
    name: 'label',
    type: 'text',
    label: 'Label',
    required: true,
  },
  {
    name: 'newTab',
    type: 'checkbox',
    label: 'Open in New Tab',
    defaultValue: false,
  },
]
