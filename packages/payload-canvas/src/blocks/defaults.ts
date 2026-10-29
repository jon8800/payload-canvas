import type { CollectionSlug, Field } from 'payload'
import { defineBlock } from '../core/blocks'
import { COLLECTION_LIST_BLOCK, FIELD_BLOCK, INDEX_PATH, ITEM_PATH, LIST_EMPTY_SLOT, LIST_ITEM_SLOT, PAGE_PATH, PARENT_PATH, REPEAT_BLOCK } from '../core/bindings'
import { TEXT_LIST_BLOCK, TEXT_LIST_ITEM_BLOCK, TEXT_LIST_SLOT } from '../core/textList'
import type { BlockDefinition } from '../core/types'
import { classesOf, INTERACTIVE, labelField } from './builtins/shared'
import { linkField, when } from './link'
import { FIELD_CLASS_MAP } from './client/field'
import { MENU_CLASS_MAP, MENU_LABELS } from './client/menu'

// The class maps and labels the components use live in leaf modules (no block definitions), so
// client components can import them alone.
export { FIELD_CLASS_MAP, MENU_CLASS_MAP, MENU_LABELS }

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

const MENU_CLASSES = [...classesOf(MENU_CLASS_MAP), 'group']

const FIELD_CLASSES = classesOf(FIELD_CLASS_MAP)

/**
 * The `collection` field of the collection list and repeat blocks: a select of `slugs`, or a text
 * field when there are none. The plugin's `listCollectionsOf` uses it too.
 */
export function listCollectionField(slugs: readonly string[] | undefined, args: { label: string; required: boolean; description?: string }): Field {
  const admin = args.description ? { admin: { description: args.description } } : {}
  const required = args.required ? { required: true } : {}
  return slugs && slugs.length > 0
    ? { name: 'collection', type: 'select', label: args.label, options: [...slugs], ...required, ...admin }
    : { name: 'collection', type: 'text', label: args.label, ...required, ...admin }
}

const PICKED_HELP = 'Only these documents, in this order. Limit, sort, skip and pages then do not apply.'

/** The collection list's picked documents: a relationship to `slugs`, or ids as text when there are none. */
export function pickedDocumentsField(slugs: readonly string[] | undefined): Field {
  if (!slugs || slugs.length === 0) {
    return { name: 'ids', type: 'text', label: 'Picked document ids', hasMany: true, admin: { description: PICKED_HELP } }
  }
  return {
    name: 'ids',
    type: 'relationship',
    label: 'Picked documents',
    // The slugs come from the app, so they cannot match Payload's generated slug type.
    relationTo: (slugs.length === 1 ? slugs[0] : [...slugs]) as never,
    hasMany: true,
    admin: { description: PICKED_HELP },
  }
}

/**
 * The default blocks: stack, grid, heading, text, richText, image, button, link, menu, list (with
 * its listItem blocks), quote, divider, spacer, video, and the dynamic blocks field, collectionList and repeat.
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
          { label: 'Numbered list (ol)', value: 'ol' },
          { label: 'Bullet list (ul)', value: 'ul' },
          { label: 'List item (li)', value: 'li' },
          { label: 'Term list (dl)', value: 'dl' },
          { label: 'Term (dt)', value: 'dt' },
          { label: 'Term description (dd)', value: 'dd' },
          { label: 'Figure (figure)', value: 'figure' },
          { label: 'Figure caption (figcaption)', value: 'figcaption' },
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
        'Use it to group blocks and build sections. Set "as" to "section", "header", "footer" and so on for semantic HTML; ' +
        '"ol"/"ul" with "li" children for lists, "dl" with "dt"/"dd" for term lists, "figure" with "figcaption".',
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
      {
        name: 'accent',
        type: 'text',
        label: 'Accent words',
        localized: true,
        admin: {
          description: 'Words of the heading to highlight, for example "fast" in "Fast websites". They render as <em>; style them with classes like [&_em]:text-primary.',
        },
      },
    ],
    // `break-words`: a long word (a URL, a product code) wraps instead of widening the page.
    defaultClassName: 'text-3xl font-bold break-words',
    ai: {
      description:
        'A page or section heading. Use level "1" once per page, "2" for sections. "accent" names words of the text ' +
        'to highlight: they render as <em>, styled with className variants such as "[&_em]:text-primary [&_em]:not-italic".',
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
    fields: [
      { name: 'content', type: 'richText', label: 'Content', required: true, localized: true },
    ],
    defaultClassName: 'prose',
    ai: {
      description:
        'Formatted text (Lexical JSON): paragraphs, headings, bold and italic, links and lists. ' +
        'Use it for articles and longer copy. The "prose" class styles the content. Each heading gets an id ' +
        'from its text (e.g. "Our prices" -> "our-prices"; repeats get "-2"), for "#id" links and the tableOfContents block.',
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
      {
        name: 'priority',
        type: 'checkbox',
        label: 'Load first',
        admin: { description: 'For the main image at the top of the page: it loads at once with high priority instead of lazily.' },
      },
      {
        name: 'sizes',
        type: 'text',
        label: 'Sizes',
        admin: { description: 'The width the image shows at, for the browser to pick a file, for example "(min-width: 768px) 50vw, 100vw". Empty: the full width.' },
      },
    ],
    ai: {
      description:
        `An image from the "${mediaCollection}" collection, stored by its document ID. ` +
        'Without an image it renders nothing on the site. Set "priority": true on the hero image (the largest image ' +
        'at the top: it loads eagerly with fetchpriority high). "sizes" is the HTML sizes attribute, e.g. ' +
        '"(min-width: 768px) 50vw, 100vw". The media focal point (focalX, focalY) sets object-position.',
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
    defaultClassName: 'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground',
    ai: {
      description:
        'A call-to-action button. "link.type" is "url" (set "link.url") or "reference" (set "link.reference" to ' +
        '{ relationTo, value }). Without a link it renders as plain text. For a button with an icon, use a link block ' +
        'that holds a text block and an icon block.',
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
    // `allowInline`: custom blocks marked `inline: true` (an icon, a badge) may go in directly too.
    slots: { children: { label: 'Content', allow: LINK_CONTENT, disallow: INTERACTIVE, allowInline: true } },
    defaultClassName: 'block',
    ai: {
      description:
        'A clickable container: everything inside it links to one place. Use it for cards that link to a page. ' +
        `It holds only ${LINK_CONTENT.join(', ')} blocks and the site's inline blocks (see the slot's accepted types), ` +
        'and never links, buttons, forms, menus or lists of links.',
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
          {
            name: 'children',
            type: 'array',
            label: 'Dropdown links',
            admin: {
              description:
                'Optional. Links under this one (one level), shown in a dropdown. The link above is optional when it has ' +
                'dropdown links: without it the label opens the dropdown.',
            },
            fields: [
              { name: 'label', type: 'text', label: 'Label', required: true, localized: true },
              linkField({ collections: linkCollections }),
            ],
          },
        ],
      },
      labelField('label', MENU_LABELS.label, 'Menu name for screen readers, for example "Footer"'),
      labelField('toggleLabel', MENU_LABELS.toggleLabel, 'Text of the button that opens the links on small screens'),
      labelField('submenuLabel', MENU_LABELS.submenuLabel, 'Name of the arrow button next to a link with dropdown links'),
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
    parts: {
      link: { label: 'Links' },
      submenu: { label: 'Dropdowns' },
      submenuLink: { label: 'Dropdown links' },
      panel: { label: 'Small-screen panel' },
    },
    classes: MENU_CLASSES,
    ai: {
      description:
        'Site navigation: a <nav> with a list of links. The link to the current page is marked. ' +
        'On small screens the links fold into a "Menu" button that opens a panel ("collapse": "md" or "lg"; ' +
        '"never" keeps the links visible, for footers). The className lays out the links. ' +
        'Put it in a header stack that has the "relative" class, so the panel opens below the header. ' +
        'Optional "ctaLabel" and "cta" (a link) add a button as the last row of the small-screen panel. "toggleLabel" is the text of the menu button (default "Menu"; translate it per locale). ' +
        'An item may have "children" (one level of { label, link }): a dropdown. With its own link the item shows the link and a ' +
        'small arrow button that opens the dropdown ("submenuLabel" names that button, default "{label} menu"); without a link the ' +
        'label itself opens it. On small screens the children show as a nested list in the panel. ' +
        'Style the inner elements with "partClassName": "link" (each link of the inline list), "submenu" (the dropdown box), ' +
        '"submenuLink" (each dropdown link), "panel" (the small-screen panel). They add to the classes the menu sets itself.',
      example: {
        type: 'menu',
        props: {
          label: 'Main',
          collapse: 'md',
          items: [
            { label: 'About', link: { type: 'url', url: '/about' } },
            {
              label: 'Services',
              children: [
                { label: 'Web design', link: { type: 'url', url: '/services/web-design' } },
                { label: 'Hosting', link: { type: 'url', url: '/services/hosting' } },
              ],
            },
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

  const itemLink = linkField({ collections: linkCollections })
  const listItem = defineBlock({
    type: TEXT_LIST_ITEM_BLOCK,
    label: 'List item',
    icon: 'text',
    category: 'Content',
    fields: [
      { name: 'text', type: 'text', label: 'Text', required: true, localized: true },
      {
        ...itemLink,
        admin: {
          ...itemLink.admin,
          description:
            'Optional. The item text becomes a link. Leave it empty in a list inside a Link block: a link cannot hold another link.',
        },
      },
    ],
    parents: [TEXT_LIST_BLOCK],
    ai: {
      description:
        `One item (<li>) of a "${TEXT_LIST_BLOCK}" block. It goes only in a list's "${TEXT_LIST_SLOT}" slot. ` +
        'Optional "link" makes the whole item text a link (<li><a>text</a></li>); without a link it is plain text. ' +
        'Never set a link on items of a list inside a "link" block.',
      example: { type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Pricing', link: exampleLink } },
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
        admin: { description: 'The name of the field to show, for example "content" or "featuredImage". For a field inside another, join the names with a dot: "author.name". Formatters go after a "|": "price|currency:USD".' },
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
        'and inside a collection list item. "path" takes binding formatters after a "|": "price|currency:USD", ' +
        '"publishedAt|date:en-US", "summary|truncate:160". Rich-text headings get ids from their text (e.g. "Our prices" -> ' +
        '"our-prices", repeats get "-2"), for "#id" links.',
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
      listCollectionField(listCollections, { label: 'Collection', required: true }),
      { name: 'limit', type: 'number', label: 'Number of items', defaultValue: 3, min: 1, max: 100 },
      {
        name: 'sort',
        type: 'text',
        label: 'Sort',
        defaultValue: '-createdAt',
        admin: {
          description:
            'The field to sort by, for example "publishedAt". Put a "-" in front for newest or largest first: "-publishedAt". ' +
            '"$random" shuffles the newest 100 matches once per page build.',
        },
      },
      pickedDocumentsField(listCollections),
      {
        name: 'excludeCurrent',
        type: 'checkbox',
        label: 'Leave out the current document',
        defaultValue: true,
        admin: { description: 'On a page made from a template, the item that the page shows is not listed again.' },
      },
      {
        name: 'filterField',
        type: 'text',
        label: 'Filter by field',
        admin: {
          description:
            'Only documents related to the current document through this field, for example "services" or "category". ' +
            'Works on pages made from a template. On other pages the list shows nothing.',
        },
      },
      {
        name: 'filterBy',
        type: 'select',
        label: 'Relation',
        defaultValue: 'current',
        options: [
          { label: 'The listed documents\' field holds the current document', value: 'current' },
          { label: 'The listed documents share a value with the current document\'s field', value: 'shared' },
          { label: 'The current document\'s field points to the listed documents', value: 'linked' },
        ],
        admin: { description: 'How "Filter by field" relates the listed documents to the current document.' },
      },
      {
        name: 'where',
        type: 'json',
        label: 'Where',
        admin: {
          description:
            'A Payload where query, added to the filter. Example: { "featured": { "equals": true } }. Dates may use ' +
            '"$now", "$now-30d" or "$now+12h". In a template, "$page.<field>" uses a field of the page\'s document; ' +
            '"$query.<param>" uses a URL value (left out without one).',
          // The inspector edits it as condition rows over the fields of the chosen collection.
          custom: { builderWhere: { collectionField: 'collection' } },
        },
      },
      {
        name: 'queryFilters',
        type: 'json',
        label: 'URL filters',
        admin: {
          description:
            'Filters from the page URL. Each row is a URL parameter and a field: with "category" and "category", ' +
            '?category=news lists documents whose category is "news". Several values (?tag=css,react) match any of them; ' +
            'all rows must match. The editor preview ignores them.',
          // The inspector edits it as rows (parameter, field), with JSON for the full form.
          custom: { builderQueryFilters: { collectionField: 'collection' } },
        },
      },
      { name: 'offset', type: 'number', label: 'Skip items', min: 0, admin: { description: 'Documents to leave out at the start.' } },
      {
        name: 'paginate',
        type: 'select',
        label: 'Pages',
        defaultValue: 'none',
        options: [
          { label: 'None: only the first items', value: 'none' },
          { label: 'Pages with ?page=N links', value: 'pages' },
        ],
        admin: {
          description:
            'Pages: "Number of items" per page, with page links under the list. Long lists show the first, the last and the ' +
            'pages around the current one, with "…" between. "Skip items" does not apply.',
        },
      },
      {
        name: 'pageParam',
        type: 'text',
        label: 'Page parameter',
        admin: {
          description:
            'The URL parameter of the page number. Empty: "page". Give each paginated list on one page its own, for example ' +
            '"reviewsPage". Letters, digits, _ and -.',
          ...when('paginate', 'pages'),
        },
      },
      {
        name: 'pagerLabel',
        type: 'text',
        label: 'Page links: label for screen readers',
        localized: true,
        admin: when('paginate', 'pages'),
      },
      {
        name: 'depth',
        type: 'select',
        label: 'Related data depth',
        defaultValue: '1',
        options: [
          { label: '1: the related documents of each item', value: '1' },
          { label: '2: also their related documents (larger)', value: '2' },
        ],
        admin: { description: 'How far related documents of each item load, for example 2 to reach a category\'s image.' },
      },
    ],
    slots: { [LIST_ITEM_SLOT]: { label: 'Item' }, [LIST_EMPTY_SLOT]: { label: 'When empty', styles: true } },
    // The page links: the <nav> that holds them (a gap "…" is a span with data-page-gap) and each link.
    parts: { pager: { label: 'Page links', defaultClassName: 'flex flex-wrap gap-2' }, pageLink: { label: 'Each page link' } },
    defaultClassName: 'grid grid-cols-1 gap-6 md:grid-cols-3',
    ai: {
      description:
        'Lists the latest documents of a collection (e.g. "latest posts"). The "item" slot is the design of ONE ' +
        'item: it repeats for every document. Blocks in it bind to the ITEM\'s fields with "bindings", e.g. a ' +
        'heading with bindings { "text": "title" } and a link with bindings { "link": "$url" } (the item\'s URL). ' +
        'Only published documents show on the site. ' +
        'To list documents related to the current document (templates only; on normal pages the list is empty), set ' +
        '"filterField" (a field name) and "filterBy": "current" (default) lists documents whose filterField holds ' +
        'the current document (e.g. on a category template, posts whose "categories" include this category); ' +
        '"shared" lists documents whose filterField shares a value with the current document\'s filterField ' +
        '(e.g. related posts with a "category" in common); "linked" lists ' +
        'the documents the current document\'s filterField points to (e.g. on a post template, the post\'s ' +
        '"authors"). With "shared" or "linked" and an empty field, the list is empty. "where" is a static Payload ' +
        'where query AND-ed with the rest, e.g. { "featured": { "equals": true } }, with "or" for alternatives; date values may be "$now", ' +
        '"$now-30d" or "$now+7d" (units d and h). A value "$page.<field>" is that field of the current document when the ' +
        'list loads (e.g. { "category": { "equals": "$page.category" } } on a post template; ids for relationships; ' +
        'without a value the list is empty, except for not_equals and not_in, which are left out). A value "$query.<param>" is ' +
        'the URL value (several values make equals an "in"); without one the condition is left out, and the canvas has none. "queryFilters" filters by the page URL: { "<param>": "<field path>" } ' +
        'means the field equals the URL value (e.g. { "category": "category" } for ?category=news); the full form ' +
        '{ "<param>": { "<value>": where } } maps each value to a where (e.g. { "age": { "recent": { "publishedAt": ' +
        '{ "greater_than": "$now-30d" } } } } for ?age=recent). Values of one ' +
        'param (repeated or comma-separated) are OR-ed, params are AND-ed; the canvas ignores them. "offset" skips ' +
        'documents. "depth" ("1" or "2") is how deep related documents load. "ids" picks documents by id and keeps the ' +
        'pick order (limit, sort, offset and pages then do not apply). "sort": "$random" shuffles the newest 100 ' +
        'matches once per page build. "paginate": "pages" shows "limit" items per page with crawlable ?page=N links ' +
        'under the list (style them with "partClassName" "pager" for the <nav> and "pageLink" for each link; the current link has aria-current="page"; long ' +
        'lists show "…" gaps as <span data-page-gap>). Two paginated lists on one page need their own "pageParam" ' +
        '(default "page"), for example "reviewsPage". "pagerLabel" names the page links for screen readers (default "Pages"). ' +
        'The "empty" slot shows instead of the ' +
        'items when no document matches (e.g. a text "No posts yet"); it renders in its own div, styled ' +
        'with "partClassName": { "empty": "col-span-full ..." }.',
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

  const repeat = defineBlock({
    type: REPEAT_BLOCK,
    label: 'Repeat',
    icon: 'repeat',
    category: 'Dynamic',
    fields: [
      {
        name: 'path',
        type: 'text',
        label: 'Field',
        required: true,
        admin: {
          description:
            'The list field of the current document to repeat, for example "faqs" (an array), "gallery" or "authors" ' +
            '(many uploads or relationships) or "tags" (many values). Inside a collection list: a field of each item.',
        },
      },
      { name: 'limit', type: 'number', label: 'Number of rows', min: 1, admin: { description: 'Empty: every row.' } },
      { name: 'offset', type: 'number', label: 'Skip rows', min: 0, admin: { description: 'Rows to leave out at the start, for example 1 to skip the first photo.' } },
      listCollectionField(listCollections, {
        label: 'Related collection',
        required: false,
        description: 'For a relationship field: the collection of its documents, so "$url" links to each one.',
      }),
      {
        name: 'as',
        type: 'select',
        label: 'Wrapper',
        defaultValue: 'div',
        options: [
          { label: 'A div around the rows', value: 'div' },
          { label: 'None: the rows sit in the parent', value: 'none' },
        ],
        admin: {
          description:
            'None: the rows become direct children of the parent block, for example the cells of a grid or the items of a list. ' +
            "The repeat's own classes and animations then do nothing.",
        },
      },
    ],
    slots: { [LIST_ITEM_SLOT]: { label: 'Row' } },
    defaultClassName: 'flex flex-col gap-4',
    ai: {
      description:
        'Repeats its "item" slot once per row of a list field of the CURRENT document (templates; inside a collection ' +
        'list item, of each listed document; inside another repeat, of the row). "path" is the field: an array ' +
        '(e.g. FAQs, prices), a hasMany upload (e.g. a gallery), a hasMany relationship, or hasMany text/select. ' +
        'Blocks in "item" bind to the ROW: the field names of an array row (e.g. "question", "price"), the related ' +
        `document's fields (e.g. "name"; "$url" when "collection" names its collection), "${ITEM_PATH}" (the row value ` +
        `itself: an upload for an image, a text for a text block), "${INDEX_PATH}" (the row number from 1), ` +
        `"${PARENT_PATH}.<field>" (the enclosing document, e.g. "${PARENT_PATH}.name") and "${PAGE_PATH}.<field>" (the page's ` +
        'document). "limit" and "offset" pick rows (offset 1 skips the first). "as": "div" (default) wraps the rows in ' +
        'a div that takes the className; "none" renders the rows with no wrapper, as direct children of the parent ' +
        '(e.g. cells of a grid, items of a stack with as "ul"), and then className and motion do nothing. ' +
        'On a page without a current document ' +
        'it shows nothing. Example 2 (photos): { "type": "repeat", "props": { "path": "gallery", "offset": 1 }, ' +
        `"slots": { "item": [{ "type": "image", "bindings": { "image": "${ITEM_PATH}" } }] } }.`,
      example: {
        type: REPEAT_BLOCK,
        props: { path: 'faqs' },
        className: 'flex flex-col gap-4',
        slots: {
          [LIST_ITEM_SLOT]: [
            {
              id: 'b_example_1',
              type: 'stack',
              className: 'flex flex-col gap-2 rounded-lg border p-4',
              slots: {
                children: [
                  { id: 'b_example_2', type: 'heading', props: { level: '3' }, bindings: { text: 'question' } },
                  { id: 'b_example_3', type: 'text', bindings: { text: 'answer' } },
                ],
              },
            },
          ],
        },
      },
    },
  })

  return [stack, grid, heading, text, richText, image, button, link, menu, list, listItem, quote, divider, spacer, video, field, collectionList, repeat]
}
