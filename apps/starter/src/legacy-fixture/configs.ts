// Dev fixture: Payload block configs shaped like a real site that predates the builder (two
// levels: section blocks with nested `blocks` fields that reference leaf blocks, plus one flat
// block with an array). Copied and trimmed from real sites; site-specific admin components removed.
// Used only when NEXT_PUBLIC_BUILDER_LEGACY_DEMO=1 (see ./enabled.ts).
import type { Block, Field, GroupField } from 'payload'

/** The site's own link group, with `admin.condition` functions (as in many Payload sites). */
function link({ disableLabel = false }: { disableLabel?: boolean } = {}): Field {
  const group: GroupField = {
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
            admin: { layout: 'horizontal', width: '50%' },
            options: [
              { label: 'Internal link', value: 'reference' },
              { label: 'Custom URL', value: 'custom' },
            ],
          },
          { name: 'newTab', type: 'checkbox', label: 'Open in new tab', admin: { width: '50%' } },
        ],
      },
    ],
  }
  const targets: Field[] = [
    {
      name: 'reference',
      type: 'relationship',
      label: 'Document to link to',
      relationTo: ['pages', 'posts'],
      admin: { condition: (_, siblingData) => siblingData?.type === 'reference' },
    },
    {
      name: 'url',
      type: 'text',
      label: 'Custom URL',
      required: true,
      admin: { condition: (_, siblingData) => siblingData?.type === 'custom' },
      validate: (value: unknown) =>
        typeof value === 'string' && /^(javascript|data|vbscript):/i.test(value.trim()) ? 'Invalid URL protocol' : true,
    },
  ]
  group.fields.push(
    disableLabel
      ? { type: 'row', fields: targets }
      : { type: 'row', fields: [...targets, { name: 'label', type: 'text', label: 'Label', required: true }] },
  )
  return group
}

const paddingOptions = [
  { label: 'None', value: 'none' },
  { label: 'Small', value: 'small' },
  { label: 'Default', value: 'default' },
  { label: 'Large', value: 'large' },
]

const paddingFields: Field[] = [
  { name: 'paddingTop', type: 'select', defaultValue: 'default', options: paddingOptions, admin: { width: '50%' } },
  { name: 'paddingBottom', type: 'select', defaultValue: 'default', options: paddingOptions, admin: { width: '50%' } },
]

export const HeadingBlock: Block = {
  slug: 'heading',
  interfaceName: 'LegacyHeadingBlock',
  labels: { singular: 'Heading', plural: 'Headings' },
  admin: { disableBlockName: true },
  fields: [
    { name: 'eyebrow', type: 'text', admin: { description: 'Small uppercase label above the heading' } },
    { name: 'text', type: 'text', required: true },
    {
      name: 'level',
      type: 'select',
      defaultValue: 'h2',
      options: [
        { label: 'H2', value: 'h2' },
        { label: 'H3', value: 'h3' },
        { label: 'H4', value: 'h4' },
      ],
    },
    {
      name: 'align',
      type: 'select',
      defaultValue: 'left',
      options: [
        { label: 'Left', value: 'left' },
        { label: 'Center', value: 'center' },
      ],
    },
  ],
}

export const RichTextBlock: Block = {
  slug: 'richText',
  interfaceName: 'LegacyRichTextBlock',
  labels: { singular: 'Rich Text', plural: 'Rich Text Blocks' },
  admin: { disableBlockName: true },
  fields: [{ name: 'content', type: 'richText', required: true }],
}

export const ImageBlock: Block = {
  slug: 'image',
  interfaceName: 'LegacyImageBlock',
  labels: { singular: 'Image', plural: 'Images' },
  fields: [
    { name: 'image', type: 'upload', relationTo: 'media', required: true },
    {
      name: 'aspect',
      type: 'select',
      defaultValue: 'auto',
      options: [
        { label: 'Square', value: 'square' },
        { label: '16:9', value: '16:9' },
        { label: 'Auto', value: 'auto' },
      ],
    },
    { name: 'caption', type: 'text' },
    {
      name: 'overlayButton',
      type: 'group',
      admin: { description: 'Optional button over the bottom of the image' },
      fields: [{ name: 'label', type: 'text' }, link({ disableLabel: true })],
    },
  ],
}

export const ButtonBlock: Block = {
  slug: 'button',
  interfaceName: 'LegacyButtonBlock',
  labels: { singular: 'Button / Link', plural: 'Buttons / Links' },
  fields: [
    link(),
    {
      name: 'variant',
      type: 'select',
      defaultValue: 'primary',
      options: [
        { label: 'Primary', value: 'primary' },
        { label: 'Outline', value: 'outline' },
      ],
    },
  ],
}

export const FaqAccordionBlock: Block = {
  slug: 'faqAccordion',
  interfaceName: 'LegacyFaqAccordionBlock',
  labels: { singular: 'FAQ Accordion', plural: 'FAQ Accordions' },
  fields: [
    { name: 'heading', type: 'text' },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'manual',
      options: [
        { label: 'Manual', value: 'manual' },
        { label: 'From Collection', value: 'collection' },
      ],
    },
    {
      name: 'faqs',
      type: 'array',
      admin: { condition: (_, siblingData) => siblingData?.source === 'manual' },
      fields: [
        { name: 'question', type: 'text', required: true },
        { name: 'answer', type: 'richText', required: true },
      ],
    },
    {
      name: 'category',
      type: 'text',
      admin: { condition: (_, siblingData) => siblingData?.source === 'collection', description: 'Filter FAQs by category slug' },
    },
  ],
}

/**
 * A leaf whose component is an async server component that queries Payload (as the model grids
 * and review carousels of real sites do). The canvas renders it on the server.
 */
export const LatestPostsBlock: Block = {
  slug: 'latestPosts',
  labels: { singular: 'Latest Posts', plural: 'Latest Posts' },
  fields: [
    { name: 'heading', type: 'text', defaultValue: 'Latest posts' },
    { name: 'count', type: 'number', defaultValue: 3, min: 1, max: 12 },
  ],
}

/** A leaf whose component takes `{ block, context }`, where `context` is data the page loads once. */
export const PageFactsBlock: Block = {
  slug: 'pageFacts',
  labels: { singular: 'Page Facts', plural: 'Page Facts' },
  fields: [{ name: 'label', type: 'text', defaultValue: 'Posts on this site' }],
}

export const leafBlocks = [HeadingBlock, RichTextBlock, ImageBlock, ButtonBlock, FaqAccordionBlock, LatestPostsBlock, PageFactsBlock]
// `as never`: the generated `BlockSlug` type does not know the fixture's blocks.
const leafSlugs = leafBlocks.map((b) => b.slug) as never[]

export const FullWidthSection: Block = {
  slug: 'fullWidth',
  interfaceName: 'LegacyFullWidthBlock',
  labels: { singular: 'Full Width Section', plural: 'Full Width Sections' },
  admin: { disableBlockName: true },
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
            { type: 'row', fields: paddingFields },
            {
              name: 'background',
              type: 'select',
              defaultValue: 'default',
              options: [
                { label: 'Default', value: 'default' },
                { label: 'Dark', value: 'dark' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

export const TwoColumnSection: Block = {
  slug: 'twoColumn',
  interfaceName: 'LegacyTwoColumnBlock',
  labels: { singular: 'Two Column Section', plural: 'Two Column Sections' },
  admin: { disableBlockName: true },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Content',
          fields: [
            { name: 'leftColumn', type: 'blocks', blockReferences: leafSlugs, blocks: [] },
            { name: 'rightColumn', type: 'blocks', blockReferences: leafSlugs, blocks: [] },
          ],
        },
        {
          label: 'Design',
          fields: [
            { type: 'row', fields: paddingFields },
            {
              name: 'columnRatio',
              type: 'select',
              defaultValue: '50-50',
              options: [
                { label: 'Equal (50/50)', value: '50-50' },
                { label: 'Content heavy (67/33)', value: '67-33' },
              ],
            },
            { name: 'reverseOnMobile', type: 'checkbox', defaultValue: false },
          ],
        },
      ],
    },
  ],
}

/**
 * A section whose component is an async server component (it counts the posts) with a nested
 * blocks field. It renders the field with `PayloadSlot`, so its children stay editable on the canvas.
 */
export const PostsSection: Block = {
  slug: 'postsSection',
  labels: { singular: 'Posts Section', plural: 'Posts Sections' },
  admin: { disableBlockName: true },
  fields: [
    { name: 'title', type: 'text', defaultValue: 'From the blog' },
    { name: 'content', type: 'blocks', blockReferences: leafSlugs, blocks: [] },
  ],
}

/** A flat block, as on sites without sections: text fields and an array. */
export const SectionIntroBlock: Block = {
  slug: 'sectionIntro',
  labels: { singular: 'Section Intro', plural: 'Section Intros' },
  fields: [
    { name: 'eyebrow', type: 'text' },
    { name: 'heading', type: 'text', required: true },
    { name: 'paragraphs', type: 'array', fields: [{ name: 'text', type: 'textarea' }] },
  ],
}

/** The page's own blocks field allows these (the sections). */
export const rootSlugs: string[] = ['fullWidth', 'twoColumn', 'sectionIntro', 'postsSection']

/** Top-level `config.blocks` of the fixture site. */
export const legacyBlockConfigs: Block[] = [FullWidthSection, TwoColumnSection, SectionIntroBlock, PostsSection, ...leafBlocks]
