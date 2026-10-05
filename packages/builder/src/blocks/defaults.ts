import type { CollectionSlug } from 'payload'
import { defineBlock } from '../core/blocks'
import { COLLECTION_LIST_BLOCK, FIELD_BLOCK, LIST_ITEM_SLOT } from '../core/bindings'
import { TEXT_LIST_BLOCK, TEXT_LIST_ITEM_BLOCK, TEXT_LIST_SLOT } from '../core/textList'
import type { BlockDefinition } from '../core/types'
import { BUILDER_CSS_CLASS } from '../css/marker'
import { linkField, when } from './link'

export type DefaultBlocksOptions = {
  /** Upload collection for the image and video blocks. Default "media". */
  mediaCollection?: string
  /**
   * Collections a button or link can point to (for example ["pages", "posts"]). Stored as
   * `{ relationTo, value }`. Empty (the default) leaves only URL links.
   */
  linkCollections?: string[]
  /**
   * Collections the collection list block can show (they need a `url` in the plugin config).
   * Default: a text field. The plugin turns it into a select of its collections that have a `url`.
   */
  listCollections?: string[]
}

/** Block types a Link block may hold directly: content without its own links or controls. */
const LINK_CONTENT = ['stack', 'grid', 'heading', 'text', 'image', 'list', 'quote', 'divider', 'spacer', 'field']

/**
 * Interactive block types: never inside a Link block, at any depth. `form` is the starter's custom
 * form block; a type that does not exist is ignored.
 */
const INTERACTIVE = ['link', 'button', 'menu', 'richText', 'video', 'collectionList', 'form']

/** Adds the marker class to every class string of a map (see `BUILDER_CSS_CLASS`). */
function withMarker<T extends Record<string, string | Record<string, string>>>(map: T): T {
  const entries = Object.entries(map).map(([key, value]) => [
    key,
    typeof value === 'string' ? `${value} ${BUILDER_CSS_CLASS}` : withMarker(value),
  ])
  return Object.fromEntries(entries) as T
}

/**
 * Classes the menu component uses itself (the toggle, the panel and the links). They are listed in
 * the block's `classes`, so the generated CSS has them. Each string also holds `builder-css`:
 * the generated CSS only styles elements with that class. Keep in sync with `Menu.tsx` in
 * `@payload-toolkit/builder-react`.
 */
export const MENU_CLASS_MAP = withMarker({
  /** The inline list: its items become children of the <nav>, so the block's className lays them out. */
  list: { md: 'hidden md:contents', lg: 'hidden lg:contents', never: 'contents' },
  toggleWrap: { md: 'md:hidden', lg: 'lg:hidden' },
  link:
    'inline-flex items-center py-2 opacity-75 transition-opacity hover:opacity-100 ' +
    'aria-[current=page]:opacity-100 aria-[current=page]:underline decoration-1 underline-offset-8',
  toggle:
    'flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-md px-2 -mr-2 ' +
    '[&::-webkit-details-marker]:hidden',
  iconOpen: 'size-5 group-open:hidden',
  iconClose: 'hidden size-5 group-open:block',
  panel:
    'absolute inset-x-0 top-full z-50 border-y border-border bg-background px-5 pt-2 pb-6 text-foreground ' +
    'shadow-md',
  panelList: 'flex flex-col',
  panelLink:
    'flex min-h-12 items-center border-b border-border py-3 text-lg ' +
    'aria-[current=page]:font-semibold aria-[current=page]:underline decoration-1 underline-offset-8',
  /** The optional button after the links in the panel. */
  panelCta:
    'mt-5 flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-medium ' +
    'text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--color-primary),black_14%)]',
} as const)

/**
 * Classes the field component adds to rich text that has no `prose` class of its own (see `Field.tsx`),
 * so a post body looks right by default. Listed in the field block's `classes`.
 */
export const FIELD_CLASS_MAP = withMarker({ richText: 'prose max-w-none' } as const)

const MENU_CLASSES = [
  ...new Set(
    Object.values(MENU_CLASS_MAP)
      .flatMap((value) => (typeof value === 'string' ? [value] : Object.values(value)))
      .flatMap((value) => value.split(' '))
      .filter((cls) => cls !== BUILDER_CSS_CLASS),
  ),
  'group',
]

const FIELD_CLASSES = Object.values(FIELD_CLASS_MAP)
  .flatMap((value) => value.split(' '))
  .filter((cls) => cls !== BUILDER_CSS_CLASS)

/**
 * The built-in blocks: stack, grid, heading, text, richText, image, button, link, menu, list (with
 * its listItem blocks), quote, divider, spacer, video, and the dynamic blocks field and collectionList.
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
        label: 'Kind of area',
        options: [
          { label: 'Plain group (div)', value: 'div' },
          { label: 'Page section (section)', value: 'section' },
          { label: 'Site header (header)', value: 'header' },
          { label: 'Site footer (footer)', value: 'footer' },
          { label: 'Main content (main)', value: 'main' },
          { label: 'Navigation (nav)', value: 'nav' },
          { label: 'Article or post (article)', value: 'article' },
          { label: 'Side note (aside)', value: 'aside' },
        ],
        defaultValue: 'div',
        admin: {
          description:
            'What this area is on the page. It does not change the look. Screen readers and search engines use it. ' +
            'Use "Page section" for each section of a page.',
        },
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
      // `localized`: with Payload localization on, each locale has its own text (README: "Localization").
      { name: 'text', type: 'text', label: 'Text', required: true, localized: true },
      {
        name: 'level',
        type: 'select',
        label: 'Level',
        options: [
          { label: 'Heading 1 – page title', value: '1' },
          { label: 'Heading 2 – section', value: '2' },
          { label: 'Heading 3 – part of a section', value: '3' },
          { label: 'Heading 4', value: '4' },
          { label: 'Heading 5', value: '5' },
          { label: 'Heading 6', value: '6' },
        ],
        defaultValue: '2',
        admin: {
          description:
            'Where the heading sits in the page outline. It does not set the size. Use Heading 1 once per page, ' +
            'Heading 2 for each section, and Heading 3 inside a section.',
        },
      },
    ],
    // `break-words`: a long word (a URL, a product code) wraps instead of widening the page.
    defaultClassName: 'text-3xl font-bold break-words',
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
    fields: [{ name: 'text', type: 'textarea', label: 'Text', required: true, localized: true }],
    defaultClassName: 'break-words',
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
    fields: [{ name: 'content', type: 'richText', label: 'Content', required: true, localized: true }],
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
      // Not required: a ready-made section can ship an empty image and still publish. The site
      // renders nothing for an empty image; the canvas shows a placeholder.
      { name: 'image', type: 'upload', label: 'Image', relationTo: mediaCollection },
      {
        name: 'alt',
        type: 'text',
        label: 'Alt text',
        localized: true,
        admin: { description: 'Describes the image for people who cannot see it. Leave empty to use the alt text saved with the image.' },
      },
    ],
    ai: {
      description:
        `An image from the "${mediaCollection}" collection, stored by its document ID. ` +
        'Without an image it renders nothing on the site.',
      example: { type: 'image', props: { image: 1, alt: 'Team photo' }, className: 'w-full rounded-lg' },
    },
  })

  const button = defineBlock({
    type: 'button',
    label: 'Button',
    icon: 'button',
    category: 'Interactive',
    fields: [
      { name: 'label', type: 'text', label: 'Label', required: true, localized: true },
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
    // Interactive content inside <a> is invalid HTML. `allow` limits direct children; `disallow`
    // refuses these types at any depth (a button inside a stack inside the link, for example).
    slots: { children: { label: 'Content', allow: LINK_CONTENT, disallow: INTERACTIVE } },
    defaultClassName: 'block',
    ai: {
      description:
        'A clickable container: everything inside it links to one place. Use it for cards that link to a page. ' +
        `It holds only ${LINK_CONTENT.join(', ')} blocks, and never links, buttons, forms, menus or lists of links.`,
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

  const menu = defineBlock({
    type: 'menu',
    label: 'Menu',
    icon: 'menu',
    category: 'Interactive',
    fields: [
      {
        name: 'items',
        type: 'array',
        label: 'Links',
        // A localized label makes the whole list of links one value per locale.
        fields: [
          { name: 'label', type: 'text', label: 'Label', required: true, localized: true },
          linkField({ collections: linkCollections }),
        ],
      },
      {
        name: 'label',
        type: 'text',
        label: 'Menu name',
        defaultValue: 'Main',
        localized: true,
        admin: { description: 'Read by screen readers, for example "Main" or "Footer".' },
      },
      {
        name: 'collapse',
        type: 'select',
        label: 'Small screens',
        options: [
          { label: 'Menu button below tablet width', value: 'md' },
          { label: 'Menu button below laptop width', value: 'lg' },
          { label: 'Always show the links', value: 'never' },
        ],
        defaultValue: 'md',
        admin: { description: 'On small screens the links fold into a "Menu" button with a panel.' },
      },
      {
        name: 'ctaLabel',
        type: 'text',
        label: 'Panel button text',
        localized: true,
        admin: {
          description:
            'Optional. A button as the last row of the small-screen panel, for example the call to action the header ' +
            'shows only on wide screens. Needs a link below. Not shown when the links are always visible.',
        },
      },
      linkField({ name: 'cta', label: 'Panel button link', collections: linkCollections }),
    ],
    defaultClassName: 'flex flex-row items-center gap-6 text-sm font-medium',
    classes: MENU_CLASSES,
    ai: {
      description:
        'Site navigation: a <nav> with a list of links. The link to the current page is marked. ' +
        'On small screens the links fold into a "Menu" button that opens a panel ("collapse": "md" or "lg"; ' +
        '"never" keeps the links visible, for footers). The className lays out the links. ' +
        'Put it in a header stack that has the "relative" class, so the panel opens below the header. ' +
        'Optional "ctaLabel" and "cta" (a link) add a button as the last row of the small-screen panel.',
      example: {
        type: 'menu',
        props: {
          label: 'Main',
          collapse: 'md',
          items: [
            { label: 'About', link: { type: 'url', url: '/about' } },
            { label: 'Contact', link: { type: 'url', url: '/contact' } },
          ],
        },
        className: 'flex flex-row items-center gap-6 text-sm font-medium',
      },
    },
  })

  const list = defineBlock({
    type: TEXT_LIST_BLOCK,
    label: 'List',
    icon: 'list',
    category: 'Content',
    fields: [{ name: 'ordered', type: 'checkbox', label: 'Numbered list' }],
    slots: { [TEXT_LIST_SLOT]: { label: 'Items', allow: [TEXT_LIST_ITEM_BLOCK] } },
    defaultClassName: 'pl-6 space-y-1',
    ai: {
      description:
        `A bulleted list (or numbered with "ordered": true). Each item is a "${TEXT_LIST_ITEM_BLOCK}" block in the ` +
        `"${TEXT_LIST_SLOT}" slot. Bullets or numbers show by default; a list-* class such as "list-none" replaces them.`,
      example: {
        type: TEXT_LIST_BLOCK,
        className: 'pl-6 space-y-1',
        slots: {
          [TEXT_LIST_SLOT]: [
            { id: 'b_example_1', type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Fast' } },
            { id: 'b_example_2', type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Simple' } },
            { id: 'b_example_3', type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Secure' } },
          ],
        },
      },
    },
  })

  const listItem = defineBlock({
    type: TEXT_LIST_ITEM_BLOCK,
    label: 'List item',
    icon: 'text',
    category: 'Content',
    fields: [{ name: 'text', type: 'text', label: 'Text', required: true, localized: true }],
    parents: [TEXT_LIST_BLOCK],
    ai: {
      description: `One item (<li>) of a "${TEXT_LIST_BLOCK}" block. It goes only in a list's "${TEXT_LIST_SLOT}" slot.`,
      example: { type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Fast' } },
    },
  })

  const quote = defineBlock({
    type: 'quote',
    label: 'Quote',
    icon: 'quote',
    category: 'Content',
    fields: [
      { name: 'quote', type: 'textarea', label: 'Quote', required: true, localized: true },
      { name: 'cite', type: 'text', label: 'Source', localized: true, admin: { description: 'Who said it, for example "Jane Doe, CEO".' } },
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
        admin: {
          description: 'A YouTube or Vimeo link, or a direct link to a video file.',
          // Format `videoUrl` (core/formats.ts): the inspector shows the message, publishing needs a good link.
          custom: { ...when('source', 'url').custom, builderFormat: 'videoUrl' },
        },
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

  const field = defineBlock({
    type: FIELD_BLOCK,
    label: 'Field',
    icon: 'field',
    category: 'Dynamic',
    fields: [
      {
        name: 'path',
        type: 'text',
        label: 'Field',
        required: true,
        admin: { description: 'The name of the field to show, for example "content" or "featuredImage". For a field inside another, join the names with a dot: "author.name".' },
      },
      {
        name: 'fallback',
        type: 'text',
        label: 'Fallback',
        localized: true,
        admin: { description: 'Shown when this field is empty.' },
      },
    ],
    classes: FIELD_CLASSES,
    ai: {
      description:
        'Shows one field of the current document in a template, rendered by its value: rich text as formatted ' +
        'text, an upload as an image, a date as a formatted date, a relationship as its title, text as text. ' +
        '"path" is a dot path from getBindingSources (e.g. "content", "author.name"). Only works in templates ' +
        'and inside a collection list item.',
      example: { type: FIELD_BLOCK, props: { path: 'content' }, className: 'prose max-w-none' },
    },
  })

  const listCollections = options?.listCollections
  const collectionList = defineBlock({
    type: COLLECTION_LIST_BLOCK,
    label: 'Collection list',
    icon: 'collectionList',
    category: 'Dynamic',
    fields: [
      listCollections && listCollections.length > 0
        ? { name: 'collection', type: 'select', label: 'Collection', options: listCollections, required: true }
        : { name: 'collection', type: 'text', label: 'Collection', required: true },
      { name: 'limit', type: 'number', label: 'Number of items', defaultValue: 3, min: 1, max: 100 },
      {
        name: 'sort',
        type: 'text',
        label: 'Sort',
        defaultValue: '-createdAt',
        admin: { description: 'The field to sort by, for example "publishedAt". Put a "-" in front for newest or largest first: "-publishedAt".' },
      },
      {
        name: 'excludeCurrent',
        type: 'checkbox',
        label: 'Leave out the current document',
        defaultValue: true,
        admin: { description: 'On a page made from a template, the item that the page shows is not listed again.' },
      },
    ],
    slots: { [LIST_ITEM_SLOT]: { label: 'Item' } },
    defaultClassName: 'grid grid-cols-1 gap-6 md:grid-cols-3',
    ai: {
      description:
        'Lists the latest documents of a collection (e.g. "latest posts"). The "item" slot is the design of ONE ' +
        'item: it repeats for every document. Blocks in it bind to the ITEM\'s fields with "bindings", e.g. a ' +
        'heading with bindings { "text": "title" } and a link with bindings { "link": "$url" } (the item\'s URL). ' +
        'Only published documents show on the site.',
      example: {
        type: COLLECTION_LIST_BLOCK,
        props: { collection: 'posts', limit: 3, sort: '-createdAt' },
        className: 'grid grid-cols-1 gap-6 md:grid-cols-3',
        slots: {
          [LIST_ITEM_SLOT]: [
            {
              id: 'b_example_1',
              type: 'link',
              className: 'flex flex-col gap-2 rounded-lg border p-4',
              bindings: { link: '$url' },
              slots: {
                children: [
                  { id: 'b_example_2', type: 'heading', props: { level: '3' }, bindings: { text: 'title' } },
                  { id: 'b_example_3', type: 'text', bindings: { text: 'excerpt' } },
                ],
              },
            },
          ],
        },
      },
    },
  })

  return [stack, grid, heading, text, richText, image, button, link, menu, list, listItem, quote, divider, spacer, video, field, collectionList]
}
