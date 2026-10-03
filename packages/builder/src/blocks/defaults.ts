import type { CollectionSlug } from 'payload'
import { defineBlock } from '../core/blocks'
import type { BlockDefinition } from '../core/types'
import { linkField, when } from './link'

export type DefaultBlocksOptions = {
  /** Upload collection for the image and video blocks. Default "media". */
  mediaCollection?: string
  /**
   * Collections a button or link can point to (for example ["pages", "posts"]). Stored as
   * `{ relationTo, value }`. Empty (the default) leaves only URL links.
   */
  linkCollections?: string[]
}

/**
 * The built-in blocks: stack, grid, heading, text, richText, image, button, link, list, quote,
 * divider, spacer, video.
 */
export function defaultBlocks(options?: DefaultBlocksOptions): BlockDefinition[] {
  const mediaCollection = (options?.mediaCollection ?? 'media') as CollectionSlug
  const linkCollections = options?.linkCollections ?? []
  const exampleLink = linkCollections.length > 0
    ? { type: 'reference', reference: { relationTo: linkCollections[0], value: 1 } }
    : { type: 'url', url: '/contact' }

  const stack = defineBlock({
    type: 'stack',
    label: 'Stack',
    icon: 'stack',
    category: 'Layout',
    fields: [
      {
        name: 'as',
        type: 'select',
        label: 'HTML element',
        options: ['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside'],
        defaultValue: 'div',
        admin: { description: 'The HTML tag. Use "section" for page sections, "header" and "footer" for page chrome.' },
      },
    ],
    slots: { children: { label: 'Children' } },
    defaultClassName: 'flex flex-col gap-4',
    ai: {
      description:
        'A container that lays out its children in a column (or a row with "flex-row"). ' +
        'Use it to group blocks and build sections. Set "as" to "section", "header", "footer" and so on for semantic HTML.',
      example: {
        type: 'stack',
        props: { as: 'section' },
        className: 'flex flex-col gap-4',
        slots: {
          children: [
            { id: 'b_example_1', type: 'heading', props: { text: 'About us', level: '2' } },
            { id: 'b_example_2', type: 'text', props: { text: 'We build websites.' } },
          ],
        },
      },
    },
  })

  const grid = defineBlock({
    type: 'grid',
    label: 'Grid',
    icon: 'grid',
    category: 'Layout',
    fields: [],
    slots: { children: { label: 'Items' } },
    defaultClassName: 'grid grid-cols-1 gap-6 md:grid-cols-3',
    ai: {
      description:
        'A CSS grid container. Set the column count with classes such as "md:grid-cols-3". ' +
        'Use it for cards, features and galleries.',
      example: {
        type: 'grid',
        className: 'grid grid-cols-1 gap-6 md:grid-cols-3',
        slots: {
          children: [
            { id: 'b_example_1', type: 'text', props: { text: 'Fast' } },
            { id: 'b_example_2', type: 'text', props: { text: 'Simple' } },
            { id: 'b_example_3', type: 'text', props: { text: 'Secure' } },
          ],
        },
      },
    },
  })

  const heading = defineBlock({
    type: 'heading',
    label: 'Heading',
    icon: 'heading',
    category: 'Content',
    fields: [
      { name: 'text', type: 'text', label: 'Text', required: true },
      {
        name: 'level',
        type: 'select',
        label: 'Level',
        options: ['1', '2', '3', '4', '5', '6'],
        defaultValue: '2',
        admin: { description: 'HTML heading level: "1" renders <h1>, "2" renders <h2>, and so on.' },
      },
    ],
    defaultClassName: 'text-3xl font-bold',
    ai: {
      description: 'A page or section heading. Use level "1" once per page, "2" for sections.',
      example: { type: 'heading', props: { text: 'Our services', level: '2' }, className: 'text-3xl font-bold' },
    },
  })

  const text = defineBlock({
    type: 'text',
    label: 'Text',
    icon: 'text',
    category: 'Content',
    fields: [{ name: 'text', type: 'textarea', label: 'Text', required: true }],
    ai: {
      description: 'A paragraph of plain text. Line breaks are kept. Use richText for formatting, links and lists.',
      example: { type: 'text', props: { text: 'We design and build fast websites.' }, className: 'text-lg' },
    },
  })

  const richText = defineBlock({
    type: 'richText',
    label: 'Rich text',
    icon: 'richText',
    category: 'Content',
    fields: [{ name: 'content', type: 'richText', label: 'Content', required: true }],
    defaultClassName: 'prose',
    ai: {
      description:
        'Formatted text (Lexical JSON): paragraphs, headings, bold and italic, links and lists. ' +
        'Use it for articles and longer copy. The "prose" class styles the content.',
      example: {
        type: 'richText',
        className: 'prose',
        props: {
          content: {
            root: {
              type: 'root',
              version: 1,
              format: '',
              indent: 0,
              direction: 'ltr',
              children: [
                {
                  type: 'paragraph',
                  version: 1,
                  format: '',
                  indent: 0,
                  direction: 'ltr',
                  textFormat: 0,
                  textStyle: '',
                  children: [
                    { type: 'text', version: 1, text: 'We build ', format: 0, detail: 0, mode: 'normal', style: '' },
                    { type: 'text', version: 1, text: 'fast', format: 1, detail: 0, mode: 'normal', style: '' },
                    { type: 'text', version: 1, text: ' websites.', format: 0, detail: 0, mode: 'normal', style: '' },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  })

  const image = defineBlock({
    type: 'image',
    label: 'Image',
    icon: 'image',
    category: 'Media',
    fields: [
      { name: 'image', type: 'upload', label: 'Image', relationTo: mediaCollection, required: true },
      {
        name: 'alt',
        type: 'text',
        label: 'Alt text',
        admin: { description: 'Overrides the image\'s own alt text.' },
      },
    ],
    ai: {
      description: `An image from the "${mediaCollection}" collection, stored by its document ID.`,
      example: { type: 'image', props: { image: 1, alt: 'Team photo' }, className: 'w-full rounded-lg' },
    },
  })

  const button = defineBlock({
    type: 'button',
    label: 'Button',
    icon: 'button',
    category: 'Interactive',
    fields: [
      { name: 'label', type: 'text', label: 'Label', required: true },
      linkField({ collections: linkCollections }),
    ],
    defaultClassName:
      'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
    ai: {
      description:
        'A call-to-action button. "link.type" is "url" (set "link.url") or "reference" (set "link.reference" to ' +
        '{ relationTo, value }). Without a link it renders as plain text.',
      example: {
        type: 'button',
        props: { label: 'Contact us', link: exampleLink },
        className:
          'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
      },
    },
  })

  const link = defineBlock({
    type: 'link',
    label: 'Link',
    icon: 'link',
    category: 'Interactive',
    fields: [linkField({ collections: linkCollections })],
    slots: { children: { label: 'Content' } },
    defaultClassName: 'block',
    ai: {
      description:
        'A clickable container: everything inside it links to one place. Use it for cards that link to a page. ' +
        'Do not put buttons or other links inside it.',
      example: {
        type: 'link',
        props: { link: exampleLink },
        className: 'block rounded-lg border p-6',
        slots: {
          children: [
            { id: 'b_example_1', type: 'heading', props: { text: 'Pricing', level: '3' } },
            { id: 'b_example_2', type: 'text', props: { text: 'See our plans.' } },
          ],
        },
      },
    },
  })

  const list = defineBlock({
    type: 'list',
    label: 'List',
    icon: 'list',
    category: 'Content',
    fields: [
      {
        name: 'items',
        type: 'array',
        label: 'Items',
        fields: [{ name: 'text', type: 'text', label: 'Text', required: true }],
      },
      { name: 'ordered', type: 'checkbox', label: 'Numbered list' },
    ],
    defaultClassName: 'pl-6 space-y-1',
    ai: {
      description:
        'A bulleted list (or numbered with "ordered": true) of short text items. Bullets or numbers show ' +
        'by default; a list-* class such as "list-none" replaces them.',
      example: {
        type: 'list',
        props: { items: [{ text: 'Fast' }, { text: 'Simple' }, { text: 'Secure' }] },
        className: 'pl-6 space-y-1',
      },
    },
  })

  const quote = defineBlock({
    type: 'quote',
    label: 'Quote',
    icon: 'quote',
    category: 'Content',
    fields: [
      { name: 'quote', type: 'textarea', label: 'Quote', required: true },
      { name: 'cite', type: 'text', label: 'Source', admin: { description: 'Who said it, for example "Jane Doe, CEO".' } },
    ],
    defaultClassName: 'border-l-4 pl-4 italic',
    ai: {
      description: 'A quotation or testimonial, with an optional source.',
      example: {
        type: 'quote',
        props: { quote: 'They rebuilt our site in a week.', cite: 'Jane Doe, Acme' },
        className: 'border-l-4 pl-4 italic',
      },
    },
  })

  const divider = defineBlock({
    type: 'divider',
    label: 'Divider',
    icon: 'divider',
    category: 'Layout',
    fields: [],
    defaultClassName: 'my-8 border-t',
    ai: {
      description: 'A horizontal line (<hr>) between sections.',
      example: { type: 'divider', className: 'my-8 border-t' },
    },
  })

  const spacer = defineBlock({
    type: 'spacer',
    label: 'Spacer',
    icon: 'spacer',
    category: 'Layout',
    fields: [],
    defaultClassName: 'h-8',
    ai: {
      description: 'Empty vertical space. Set the height with a class such as "h-16". Prefer gap and padding classes.',
      example: { type: 'spacer', className: 'h-16' },
    },
  })

  const video = defineBlock({
    type: 'video',
    label: 'Video',
    icon: 'video',
    category: 'Media',
    fields: [
      {
        name: 'source',
        type: 'select',
        label: 'Source',
        options: [
          { label: 'Upload', value: 'upload' },
          { label: 'URL (YouTube, Vimeo or a video file)', value: 'url' },
        ],
        defaultValue: 'upload',
      },
      { name: 'video', type: 'upload', label: 'Video', relationTo: mediaCollection, admin: when('source', 'upload') },
      {
        name: 'url',
        type: 'text',
        label: 'URL',
        admin: { description: 'A YouTube or Vimeo link, or a direct link to a video file.', ...when('source', 'url') },
      },
      { name: 'poster', type: 'upload', label: 'Poster image', relationTo: mediaCollection },
      { name: 'autoplay', type: 'checkbox', label: 'Autoplay', admin: { description: 'Browsers only autoplay muted videos.' } },
      { name: 'loop', type: 'checkbox', label: 'Loop' },
      { name: 'muted', type: 'checkbox', label: 'Muted' },
      { name: 'controls', type: 'checkbox', label: 'Show controls', defaultValue: true },
    ],
    defaultClassName: 'w-full',
    ai: {
      description:
        `A video: an upload from the "${mediaCollection}" collection (source "upload", set "video") or a ` +
        'YouTube, Vimeo or video file URL (source "url", set "url").',
      example: {
        type: 'video',
        props: { source: 'url', url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', controls: true },
        className: 'w-full aspect-video',
      },
    },
  })

  return [stack, grid, heading, text, richText, image, button, link, list, quote, divider, spacer, video]
}
