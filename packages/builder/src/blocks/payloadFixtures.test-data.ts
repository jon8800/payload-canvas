// Payload block configs shaped like real sites: two levels (sections with nested blocks fields
// that reference leaf blocks) and a flat site with inline blocks. Shared by the adapter and the
// conversion tests.
import type { Block, Field } from 'payload'

const link = (overrides: Record<string, unknown> = {}): Field =>
  ({
    name: 'link',
    type: 'group',
    admin: { hideGutter: true },
    fields: [
      {
        type: 'row',
        fields: [
          {
            name: 'type',
            type: 'radio',
            defaultValue: 'reference',
            options: [
              { label: 'Internal link', value: 'reference' },
              { label: 'Custom URL', value: 'custom' },
            ],
          },
          { name: 'newTab', type: 'checkbox', label: 'Open in new tab' },
        ],
      },
      {
        type: 'row',
        fields: [
          {
            name: 'reference',
            type: 'relationship',
            relationTo: ['pages', 'posts'],
            admin: { condition: (_: unknown, siblingData: { type?: string }) => siblingData?.type === 'reference' },
          },
          {
            name: 'url',
            type: 'text',
            required: true,
            admin: { condition: (_: unknown, siblingData: { type?: string }) => siblingData?.type === 'custom' },
            validate: (value: unknown) => (typeof value === 'string' && /^javascript:/i.test(value) ? 'Invalid URL protocol' : true),
          },
          { name: 'label', type: 'text', required: true },
        ],
      },
    ],
    ...overrides,
  }) as Field

const padding: Field[] = [
  { name: 'paddingTop', type: 'select', defaultValue: 'default', options: ['none', 'small', 'default', 'large'] },
  { name: 'paddingBottom', type: 'select', defaultValue: 'default', options: ['none', 'small', 'default', 'large'] },
]

export const heading: Block = {
  slug: 'heading',
  interfaceName: 'HeadingBlock',
  labels: { singular: 'Heading', plural: 'Headings' },
  admin: { disableBlockName: true, components: { Label: '/components/admin/BlockRowLabel.tsx#BlockRowLabel' } },
  fields: [
    { name: 'eyebrow', type: 'text' },
    { name: 'text', type: 'text', required: true, admin: { components: { Field: '/components/admin/AccentWordsPicker.tsx#AccentWordsPicker' } } },
    { name: 'level', type: 'select', defaultValue: 'h2', options: ['h2', 'h3', 'h4'] },
  ],
}

export const richText: Block = {
  slug: 'richText',
  labels: { singular: 'Rich Text', plural: 'Rich Text Blocks' },
  fields: [{ name: 'content', type: 'richText', required: true }],
}

export const image: Block = {
  slug: 'image',
  labels: { singular: 'Image', plural: 'Images' },
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    { name: 'caption', type: 'text' },
    { name: 'overlayButton', type: 'group', fields: [{ name: 'label', type: 'text' }, link()] },
  ],
}

export const button: Block = {
  slug: 'button',
  labels: { singular: 'Button / Link', plural: 'Buttons / Links' },
  fields: [link(), { name: 'variant', type: 'select', defaultValue: 'primary', options: ['primary', 'outline'] }],
}

export const faqAccordion: Block = {
  slug: 'faqAccordion',
  fields: [
    { name: 'heading', type: 'text' },
    { name: 'source', type: 'select', defaultValue: 'manual', options: ['manual', 'collection'] },
    {
      name: 'faqs',
      type: 'array',
      admin: { condition: (_: unknown, siblingData: { source?: string }) => siblingData?.source === 'manual' },
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText', required: true },
      ],
    },
    // A condition the adapter cannot read: it uses the whole document.
    { name: 'category', type: 'text', admin: { condition: (data: { slug?: string }) => data.slug === 'faq' } },
  ],
}

export const leaves = [heading, richText, image, button, faqAccordion]
const leafSlugs = leaves.map((b) => b.slug)

export const fullWidth: Block = {
  slug: 'fullWidth',
  labels: { singular: 'Full Width Section', plural: 'Full Width Sections' },
  admin: { group: 'Sections' },
  fields: [
    {
      type: 'tabs',
      tabs: [
        { label: 'Content', fields: [{ name: 'content', type: 'blocks', blockReferences: leafSlugs, blocks: [] }] },
        {
          label: 'Design',
          fields: [
            { name: 'bordered', type: 'checkbox', defaultValue: false },
            { name: 'backgroundImage', type: 'upload', relationTo: 'media' },
            { type: 'row', fields: padding },
          ],
        },
      ],
    },
  ],
}

export const twoColumn: Block = {
  slug: 'twoColumn',
  labels: { singular: 'Two Column Section', plural: 'Two Column Sections' },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'leftColumn', label: 'Left column', type: 'blocks', blockReferences: leafSlugs, blocks: [] },
            { name: 'rightColumn', type: 'blocks', blockReferences: leafSlugs, blocks: [] },
          ],
        },
        { label: 'Design', fields: [{ name: 'columnRatio', type: 'select', defaultValue: '50-50', options: ['50-50', '67-33'] }] },
      ],
    },
  ],
}

/** All top-level `config.blocks` of a two-level site. */
export const twoLevelConfigBlocks: Block[] = [fullWidth, twoColumn, ...leaves]

/** A flat site: inline blocks, an array with uploads, a group, a nested blocks field inside an array. */
export const sectionIntro: Block = {
  slug: 'sectionIntro',
  fields: [
    { name: 'eyebrow', type: 'text' },
    { name: 'heading', type: 'text', required: true },
    { name: 'paragraphs', type: 'array', fields: [{ name: 'text', type: 'textarea' }] },
  ],
}

export const testimonials: Block = {
  slug: 'testimonials',
  fields: [
    { name: 'heading', type: 'text', required: true },
    {
      name: 'rating',
      type: 'group',
      fields: [
        { name: 'score', type: 'number', min: 0, max: 5, defaultValue: 5 },
        { name: 'source', type: 'text', defaultValue: 'Google Reviews' },
      ],
    },
    {
      name: 'testimonials',
      type: 'array',
      fields: [
        { name: 'quote', type: 'textarea', required: true },
        { name: 'photo', type: 'upload', relationTo: 'media' },
      ],
    },
  ],
}

export const cardGrid: Block = {
  slug: 'cardGrid',
  fields: [
    {
      name: 'cards',
      type: 'array',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'body', type: 'blocks', blocks: [{ slug: 'note', fields: [{ name: 'text', type: 'text' }] }] },
      ],
    },
  ],
}

export const flatBlocks: Block[] = [sectionIntro, testimonials, cardGrid]
