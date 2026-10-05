// Small helpers that build canonical layout blocks (new ids, no empty props or slots).
// The ready-made sections in this folder use them.
import { createId, type Block, type BlockMotion } from '@payload-toolkit/builder/core'

/** A link group value as stored in block props. */
export type LinkInput =
  | { type: 'url'; url: string; newTab?: boolean }
  | { type: 'reference'; reference: { relationTo: 'pages' | 'posts'; value: number | string }; newTab?: boolean }

export type StackTag = 'div' | 'section' | 'header' | 'footer' | 'main' | 'nav' | 'article' | 'aside'
export type HeadingLevel = '1' | '2' | '3' | '4' | '5' | '6'

/**
 * A ready-made section: a named block tree that AI tools and the seed can insert.
 * `create` returns a new tree with fresh ids on every call.
 */
export type Section<Input> = {
  name: string
  description: string
  create: (input: Input) => Block
}

/**
 * Defines a section. The root block of every tree it creates gets the section's name as its
 * `label` (unless the tree sets its own), so the outline and publish errors name the section.
 */
export function defineSection<Input>(section: Section<Input>): Section<Input> {
  return {
    ...section,
    create: (input) => {
      const root = section.create(input)
      return { ...root, label: root.label ?? section.name }
    },
  }
}

/** A label and where it goes. Used for buttons and nav links. */
export type Action = { label: string; link: LinkInput }

export const url = (href: string): LinkInput => ({ type: 'url', url: href })
export const pageLink = (id: number | string): LinkInput => ({ type: 'reference', reference: { relationTo: 'pages', value: id } })
export const postLink = (id: number | string): LinkInput => ({ type: 'reference', reference: { relationTo: 'posts', value: id } })

/**
 * Class sets shared by the sections. Theme colors and fonts come from the ThemeSettings variables:
 * `font-display` is the heading font, the body uses the sans font.
 * Spacing rhythm: sections are px-5 / md:px-8 around a max-w-6xl container, py-20 / md:py-28.
 */
const BUTTON = 'inline-flex min-h-12 items-center justify-center rounded-full px-6 text-base font-medium'
/** A primary-colored button gets a little darker on hover. */
export const PRIMARY_HOVER = 'hover:bg-[color-mix(in_oklch,var(--color-primary),black_14%)]'
export const styles = {
  buttonPrimary: `${BUTTON} bg-primary text-primary-foreground transition-colors ${PRIMARY_HOVER}`,
  buttonOutline: `${BUTTON} border border-foreground/25 text-foreground transition-colors hover:border-foreground`,
  buttonInverted: `${BUTTON} bg-primary-foreground text-primary transition-opacity hover:opacity-90`,
  buttonOutlineInverted: `${BUTTON} border border-primary-foreground/40 transition-colors hover:border-primary-foreground`,
  section: 'px-5 py-20 md:px-8 md:py-28',
  container: 'mx-auto flex w-full max-w-6xl flex-col gap-12 md:gap-16',
  /** The home page's opening title. */
  displayTitle: 'font-display text-5xl leading-[1.02] tracking-[-0.03em] sm:text-6xl md:text-7xl lg:text-[5.5rem]',
  /** The title of an inner page. */
  pageTitle: 'font-display text-5xl leading-[1.04] tracking-[-0.025em] md:text-6xl lg:text-7xl',
  sectionTitle: 'font-display text-4xl leading-[1.08] tracking-[-0.02em] md:text-5xl',
  cardTitle: 'text-xl font-semibold tracking-tight',
  lead: 'max-w-[60ch] text-lg leading-relaxed text-muted-foreground md:text-xl',
  body: 'max-w-[62ch] text-lg leading-relaxed text-muted-foreground',
  muted: 'text-muted-foreground',
  textLink: 'inline-flex min-h-11 items-center font-medium underline decoration-1 underline-offset-[6px] hover:decoration-2',
  /** A large image (work, image and text): 4:3. */
  image: 'aspect-[4/3] w-full rounded-md object-cover',
  /** A card image (services, posts): 16:10, the ratio of the card illustrations, so nothing is cropped. */
  cardImage: 'aspect-[16/10] w-full rounded-md object-cover',
}

/** A title on the left and an intro on the right (stacked on phones). Used above grids. */
export const sectionHeader = (title: string, intro?: string) =>
  stack('div', 'flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-12', [
    heading(title, '2', `max-w-2xl ${styles.sectionTitle}`),
    ...(intro ? [text(intro, `${styles.lead} md:max-w-md`)] : []),
  ])

function block(type: string, props?: Record<string, unknown>, className?: string, children?: Block[]): Block {
  const result: Block = { id: createId(), type }
  if (props && Object.keys(props).length > 0) result.props = props
  if (className) result.className = className
  if (children && children.length > 0) result.slots = { children }
  return result
}

export const stack = (as: StackTag, className: string, children: Block[]) => block('stack', { as }, className, children)
export const grid = (className: string, children: Block[]) => block('grid', undefined, className, children)
export const heading = (text: string, level: HeadingLevel, className?: string) => block('heading', { text, level }, className)
export const text = (value: string, className?: string) => block('text', { text: value }, className)
export const richText = (content: unknown, className?: string) => block('richText', { content }, className)
export const image = (id: number | string, alt: string, className?: string) => block('image', { image: id, alt }, className)
export const button = (action: Action, className: string = styles.buttonPrimary) =>
  block('button', { label: action.label, link: action.link }, className)
export const link = (target: LinkInput, className: string, children: Block[]) => block('link', { link: target }, className, children)
/** A bulleted (or numbered) list. Each item is a `listItem` block; `itemClassName` styles every item. */
export function list(items: string[], ordered: boolean, className?: string, itemClassName?: string): Block {
  const result = block('list', ordered ? { ordered } : undefined, className)
  if (items.length > 0) result.slots = { items: items.map((item) => block('listItem', { text: item }, itemClassName)) }
  return result
}
export const quote = (value: string, cite: string, className?: string) => block('quote', { quote: value, cite }, className)
export const divider = (className?: string) => block('divider', undefined, className)
export const spacer = (className?: string) => block('spacer', undefined, className)
export const form = (id: number | string, className?: string) => block('form', { form: id }, className)
/** Site navigation. `collapse`: the width below which links fold into a "Menu" button ("never" for footers). */
/** `cta` adds a button as the last row of the small-screen panel. */
export const menu = (items: Action[], label: string, collapse: 'md' | 'lg' | 'never', className: string, cta?: Action) =>
  block(
    'menu',
    {
      label,
      collapse,
      items: items.map((item) => ({ label: item.label, link: item.link })),
      ...(cta ? { ctaLabel: cta.label, cta: cta.link } : {}),
    },
    className,
  )

/** Adds animations to a block. Merges with motion the block already has. */
export const withMotion = (target: Block, motion: BlockMotion): Block => ({ ...target, motion: { ...target.motion, ...motion } })

/**
 * The animations the sections share. Subtle on purpose: short distances, one entrance per group.
 * Never used on the header or the footer.
 */
export const motions = {
  /**
   * The text beside a page title: plays on load in CSS, so it starts at first paint. Never on the
   * title itself, which paints at once. The delay lets the title land first.
   */
  heroEnter: { enter: { preset: 'fade-up', trigger: 'load', duration: 700, distance: 16, delay: 120 } },
  /** One block appears as it scrolls into view. */
  reveal: { enter: { preset: 'fade-up', distance: 16 } },
  /** The children of a grid or list appear one after another. */
  staggerChildren: { enter: { preset: 'fade-up', distance: 16, stagger: 80 } },
  /** A card or button that links. */
  interactive: { hover: { preset: 'lift' }, press: { preset: 'shrink' } },
  /** A button. */
  pressable: { press: { preset: 'shrink' } },
} satisfies Record<string, BlockMotion>

/** Binds props to document fields (templates and collection list items), e.g. { text: 'title' }. */
export const bind = (target: Block, bindings: Record<string, string>): Block => ({ ...target, bindings: { ...target.bindings, ...bindings } })
/** Shows one field of the current document (templates). */
export const field = (path: string, className?: string, fallback?: string) =>
  block('field', fallback ? { path, fallback } : { path }, className)
/** Lists documents of a collection. `item` is the design of one item; its blocks bind to the item. */
export const collectionList = (
  collection: 'posts' | 'pages',
  options: { limit?: number; sort?: string; excludeCurrent?: boolean },
  className: string,
  item: Block[],
): Block => {
  const result = block('collectionList', { collection, ...options }, className)
  return { ...result, slots: { item } }
}
/** A block with no props yet, e.g. an image whose value comes from a binding. */
export const bare = (type: string, className?: string) => block(type, undefined, className)
