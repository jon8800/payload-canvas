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
  /**
   * The names of the site's icons: the same list as `builtinBlocks({ icons })`. With names, the
   * button block gets the props `icon`, `iconPosition` and `iconClassName`, and
   * `builtinComponents({ icons })` renders them. Without names the button has no icon props.
   */
  icons?: readonly string[]
}

/** "arrowUpRight" -> "arrow up right". */
export const iconLabel = (name: string) => name.replace(/([A-Z])/g, ' $1').toLowerCase()

/** The button's icon props, for a site with an icon set (`defaultBlocks({ icons })`). */
function buttonIconFields(names: readonly string[]): Field[] {
  return [
    {
      name: 'icon',
      type: 'select',
      label: 'Icon',
      options: names.map((value) => ({ label: iconLabel(value), value })),
      admin: { description: "Optional. An icon of the site's icon set next to the label. Screen readers skip it." },
    },
    {
      name: 'iconPosition',
      type: 'select',
      label: 'Icon position',
      defaultValue: 'end',
      options: [
        { label: 'Before the label', value: 'start' },
        { label: 'After the label', value: 'end' },
      ],
    },
    {
      name: 'iconClassName',
      type: 'text',
      label: 'Icon classes',
      defaultValue: 'size-4 shrink-0',
      admin: { description: 'Tailwind classes of the icon, for example "size-5".', custom: { builderClasses: true } },
    },
  ]
}

/** Block types a Link block may hold directly: content without its own links or controls. */
const LINK_CONTENT = ['stack', 'grid', 'heading', 'text', 'image', 'list', 'divider', 'field']

/** The HTML tags a stack can render as (the Container component accepts the same list). */
const STACK_TAGS = ['div', 'section', 'header', 'footer', 'main', 'nav', 'article', 'aside', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'figure', 'figcaption']

const MENU_CLASSES = [...classesOf(MENU_CLASS_MAP), 'group']

const FIELD_CLASSES = classesOf(FIELD_CLASS_MAP)

/**
 * The `collection` field of the collection list and repeat blocks: a select of `slugs`, or a text
 * field when there are none. The plugin's `listCollectionsOf` uses it too.
 */
export function listCollectionField(slugs: readonly string[] | undefined, args: { label: string; required: boolean; description?: string }): Field {
  // A setting, not content: content mode (core/contentMode.ts) does not offer it.
  const admin = { admin: { ...(args.description ? { description: args.description } : {}), custom: { builderContent: false } } }
  const required = args.required ? { required: true } : {}
  return slugs && slugs.length > 0
    ? { name: 'collection', type: 'select', label: args.label, options: [...slugs], ...required, ...admin }
    : { name: 'collection', type: 'text', label: args.label, ...required, ...admin }
}

const PICKED_HELP = 'Shows only these, in this order.'

/** The collection list's picked documents: a relationship to `slugs`, or ids as text when there are none. */
export function pickedDocumentsField(slugs: readonly string[] | undefined): Field {
  if (!slugs || slugs.length === 0) {
    return { name: 'ids', type: 'text', label: 'Only these ids', hasMany: true, admin: { description: PICKED_HELP, custom: { builderContent: false } } }
  }
  return {
    name: 'ids',
    type: 'relationship',
    label: 'Only these documents',
    // The slugs come from the app, so they cannot match Payload's generated slug type.
    relationTo: (slugs.length === 1 ? slugs[0] : [...slugs]) as never,
    hasMany: true,
    admin: { description: PICKED_HELP },
  }
}

/**
 * The default blocks: stack, grid, heading, text, richText, image, button, link, menu, list (with
 * its listItem blocks), divider, video, and the dynamic blocks field, collectionList and repeat.
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
    description: 'A box that holds blocks in a column or a row.',
    icon: 'stack',
    category: 'Layout',
    fields: [
      {
        name: 'as',
        type: 'select',
        label: 'Tag',
        options: [...STACK_TAGS],
        defaultValue: 'div',
        custom: {
          ai: { description: 'The HTML tag. It does not change the look; screen readers and search engines use it. Use "section" for each section of a page.' },
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
    description: 'Places blocks in columns and rows.',
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
    description: 'A title for a page or a section.',
    icon: 'heading',
    category: 'Content',
    fields: [
      // `localized`: with Payload localization on, each locale has its own text (README: "Localization").
      { name: 'text', type: 'text', label: 'Text', required: true, localized: true },
      {
        name: 'level',
        type: 'select',
        label: 'Tag',
        // The value is the level only ("2"); the label is the tag.
        options: ['1', '2', '3', '4', '5', '6'].map((value) => ({ label: `h${value}`, value })),
        defaultValue: '2',
        custom: {
          ai: { description: 'The level in the page outline, not the size: "1" once per page, "2" for sections, "3" inside a section.' },
        },
      },
      { name: 'accent', type: 'text', label: 'Highlighted words', localized: true },
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
    description: 'A paragraph of plain text.',
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
    description: 'Text with headings, links, lists and quotes.',
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
    description: 'A picture from the media library.',
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
        admin: { placeholder: 'From the image' },
        custom: { ai: { description: 'Empty: the alt text saved with the image.' } },
      },
      { name: 'priority', type: 'checkbox', label: 'Load first', admin: { description: 'For the main image at the top.' } },
      { name: 'sizes', type: 'text', label: 'Sizes', admin: { placeholder: '100vw', custom: { builderContent: false } } },
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

  const icons = options?.icons ?? []
  const button = defineBlock({
    type: 'button',
    label: 'Button',
    description: 'A button that links to a page or a URL.',
    icon: 'button',
    category: 'Interactive',
    fields: [
      { name: 'label', type: 'text', label: 'Label', required: true, localized: true },
      linkField({ collections: linkCollections }),
      ...(icons.length > 0 ? buttonIconFields(icons) : []),
    ],
    defaultClassName:
      'inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground' +
      (icons.length > 0 ? ' gap-2' : ''),
    ai: {
      description:
        'A call-to-action button. "link.type" is "url" (set "link.url") or "reference" (set "link.reference" to ' +
        '{ relationTo, value }). Without a link it renders as plain text.' +
        (icons.length > 0
          ? ` Optional "icon" (one of: ${icons.join(', ')}) shows an icon before ("iconPosition": "start") or after ` +
            '("end", the default) the label; "iconClassName" sizes it (default "size-4 shrink-0").'
          : ' For a button with an icon, use a link block that holds a text block and an icon block.'),
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
    description: 'Makes all the blocks inside it one link.',
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
    description: 'Navigation links for a header or a footer.',
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
            fields: [
              { name: 'label', type: 'text', label: 'Label', required: true, localized: true },
              linkField({ collections: linkCollections }),
            ],
          },
        ],
      },
      labelField('label', MENU_LABELS.label, 'Menu name'),
      labelField('toggleLabel', MENU_LABELS.toggleLabel, 'Menu button text'),
      labelField('submenuLabel', MENU_LABELS.submenuLabel, 'Dropdown button name'),
      {
        name: 'collapse',
        type: 'select',
        label: 'Menu button',
        options: [
          { label: 'Below tablet width', value: 'md' },
          { label: 'Below laptop width', value: 'lg' },
          { label: 'Never', value: 'never' },
        ],
        defaultValue: 'md',
      },
      { name: 'ctaLabel', type: 'text', label: 'Panel button text', localized: true },
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
    description: 'A bulleted or numbered list.',
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
    description: 'One item of a list.',
    icon: 'text',
    category: 'Content',
    fields: [{ name: 'text', type: 'text', label: 'Text', required: true, localized: true }, itemLink],
    parents: [TEXT_LIST_BLOCK],
    ai: {
      description:
        `One item (<li>) of a "${TEXT_LIST_BLOCK}" block. It goes only in a list's "${TEXT_LIST_SLOT}" slot. ` +
        'Optional "link" makes the whole item text a link (<li><a>text</a></li>); without a link it is plain text. ' +
        'Never set a link on items of a list inside a "link" block.',
      example: { type: TEXT_LIST_ITEM_BLOCK, props: { text: 'Pricing', link: exampleLink } },
    },
  })


  const divider = defineBlock({
    type: 'divider',
    label: 'Divider',
    description: 'A line between parts of a page.',
    icon: 'divider',
    category: 'Layout',
    fields: [],
    defaultClassName: 'my-8 border-t',
    ai: {
      description: 'A horizontal line (<hr>) between sections.',
      example: { type: 'divider', className: 'my-8 border-t' },
    },
  })


  const video = defineBlock({
    type: 'video',
    label: 'Video',
    description: 'A video from an upload, YouTube or Vimeo.',
    icon: 'video',
    category: 'Media',
    fields: [
      {
        name: 'source',
        type: 'select',
        label: 'Source',
        options: [
          { label: 'Upload', value: 'upload' },
          { label: 'Link', value: 'url' },
        ],
        defaultValue: 'upload',
      },
      { name: 'video', type: 'upload', label: 'Video', relationTo: mediaCollection, admin: when('source', 'upload') },
      {
        name: 'url',
        type: 'text',
        label: 'Video link',
        admin: {
          placeholder: 'YouTube, Vimeo or a video file',
          // Format `videoUrl` (core/formats.ts): the inspector shows the message, publishing needs a good link.
          custom: { ...when('source', 'url').custom, builderFormat: 'videoUrl' },
        },
        custom: { ai: { description: 'A YouTube or Vimeo link, or a direct link to a video file.' } },
      },
      { name: 'poster', type: 'upload', label: 'Poster image', relationTo: mediaCollection },
      { name: 'autoplay', type: 'checkbox', label: 'Autoplay', admin: { description: 'Works only when muted.' } },
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
    description: 'Shows one field of the page or of each list item.',
    icon: 'field',
    category: 'Dynamic',
    fields: [
      // The inspector shows the field picker and the format of the bindings UI (templates/Bindable).
      { name: 'path', type: 'text', label: 'Field', required: true, admin: { custom: { builderContent: false } } },
      { name: 'fallback', type: 'text', label: 'Text when empty', localized: true },
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
    description: 'Shows posts, products or other documents from a collection.',
    icon: 'collectionList',
    category: 'Dynamic',
    // `builderHeading`: the inspector shows a small heading above the field, so the long list reads in groups.
    fields: [
      listCollectionField(listCollections, { label: 'Collection', required: true }),
      pickedDocumentsField(listCollections),
      {
        name: 'depth',
        type: 'select',
        label: 'Load related data',
        defaultValue: '1',
        options: [
          { label: '1 level', value: '1' },
          { label: '2 levels', value: '2' },
        ],
      },
      {
        name: 'filterField',
        type: 'text',
        label: 'Related to this page',
        admin: {
          // The inspector shows one select of the fields that relate the two collections, and sets `filterBy` with it.
          custom: { builderHeading: 'Filter', builderRelated: { collectionField: 'collection', modeField: 'filterBy' }, builderContent: false },
        },
      },
      {
        name: 'filterBy',
        type: 'select',
        label: 'Relation',
        defaultValue: 'current',
        options: [
          { label: 'Its field links to this page', value: 'current' },
          { label: 'Same value as this page', value: 'shared' },
          { label: 'This page links to it', value: 'linked' },
        ],
        // Set by the "Related to this page" select.
        admin: { hidden: true },
      },
      {
        name: 'excludeCurrent',
        type: 'checkbox',
        label: 'Leave out the document this page shows',
        defaultValue: true,
      },
      {
        name: 'where',
        type: 'json',
        label: 'Conditions',
        admin: {
          // The inspector edits it as condition rows over the fields of the chosen collection.
          custom: { builderWhere: { collectionField: 'collection' } },
        },
        custom: {
          ai: {
            description:
              'A Payload where query, added to the filter. Dates may use "$now", "$now-30d" or "$now+12h". In a template, ' +
              '"$page.<field>" uses a field of the page\'s document; "$query.<param>" uses a URL value (left out without one).',
          },
        },
      },
      {
        name: 'queryFilters',
        type: 'json',
        label: 'URL filters',
        admin: {
          // The inspector edits it as rows (parameter, field), with JSON for the full form.
          custom: { builderQueryFilters: { collectionField: 'collection' } },
        },
        custom: { ai: { description: 'Filters from the page URL: { "<param>": "<field>" }. The editor preview ignores them.' } },
      },
      {
        name: 'sort',
        type: 'text',
        label: 'Sort',
        defaultValue: '-createdAt',
        admin: {
          // The inspector shows a select of the collection's fields, a direction and "Random".
          custom: { builderHeading: 'Sort and count', builderSort: { collectionField: 'collection' }, builderContent: false },
        },
        custom: {
          ai: {
            description:
              'A field name; a "-" in front sorts newest or largest first ("-publishedAt"). "$random" shuffles the newest 100 matches once per page build.',
          },
        },
      },
      { name: 'limit', type: 'number', label: 'Number of items', defaultValue: 3, min: 1, max: 100 },
      { name: 'offset', type: 'number', label: 'Skip first', min: 0, admin: { placeholder: '0' } },
      {
        name: 'paginate',
        type: 'select',
        label: 'Page links',
        defaultValue: 'none',
        options: [
          { label: 'None', value: 'none' },
          { label: 'Under the list', value: 'pages' },
        ],
        admin: { custom: { builderHeading: 'Pages' } },
      },
      {
        name: 'pageParam',
        type: 'text',
        label: 'URL parameter',
        admin: { placeholder: 'page', custom: { ...when('paginate', 'pages').custom, builderContent: false } },
        custom: {
          ai: {
            description: 'Empty: "page". Give each paginated list on one page its own, for example "reviewsPage". Letters, digits, _ and -.',
          },
        },
      },
      {
        name: 'pagerLabel',
        type: 'text',
        label: 'Name for screen readers',
        localized: true,
        admin: { placeholder: 'Pages', ...when('paginate', 'pages') },
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
    description: 'Repeats its blocks for each row of a list field.',
    icon: 'repeat',
    category: 'Dynamic',
    fields: [
      // The inspector shows the field picker of the bindings UI (templates/Bindable).
      { name: 'path', type: 'text', label: 'Field', required: true, admin: { custom: { builderContent: false } } },
      { name: 'limit', type: 'number', label: 'Number of rows', min: 1, admin: { placeholder: 'All' } },
      { name: 'offset', type: 'number', label: 'Skip first', min: 0, admin: { placeholder: '0' } },
      listCollectionField(listCollections, {
        label: 'Linked collection',
        required: false,
        description: 'For links to each row.',
      }),
      {
        name: 'as',
        type: 'select',
        label: 'Tag',
        defaultValue: 'div',
        options: [
          { label: 'div', value: 'div' },
          { label: 'none', value: 'none' },
        ],
        admin: { description: 'None: the rows go straight into the parent.' },
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

  return [stack, grid, heading, text, richText, image, button, link, menu, list, listItem, divider, video, field, collectionList, repeat]
}
