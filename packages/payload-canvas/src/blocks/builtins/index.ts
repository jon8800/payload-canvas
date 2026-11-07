// Opt-in built-in blocks: `builtinBlocks()` from `payload-canvas/blocks`. Client-safe, like the
// default blocks: plain data, no React. The components come from `builtinComponents()` in
// `payload-canvas/react`. The live saved section block (`sectionRef`) is not one of them: the
// plugin adds it when saved sections are on.

import type { BlockDefinition } from '../../core/types'
import { adjacentLinksBlock } from './adjacentLinks'
import { carouselBlock } from './carousel'
import { accordionBlock, disclosureBlock } from './disclosure'
import { filterLinkBlock } from './filterLink'
import { iconBlock } from './icon'
import { marqueeBlock } from './marquee'
import { popupBlock } from './popup'
import { tableOfContentsBlock } from './tableOfContents'
import { tabBlock, tabsBlock } from './tabs'

/** The built-ins you can include. `tabs` brings its child block type, `tab`. */
export const BUILTIN_TYPES = [
  'icon',
  'disclosure',
  'accordion',
  'popup',
  'tabs',
  'carousel',
  'marquee',
  'tableOfContents',
  'filterLink',
  'adjacentLinks',
] as const

export type BuiltinType = (typeof BUILTIN_TYPES)[number]

export type BuiltinBlocksOptions = {
  /** The built-ins to add. Default: all of them, but `icon` only when `icons` is given. */
  include?: readonly BuiltinType[]
  /**
   * The names of the site's icons, for the `icon` block: the keys of the map the site gives
   * `builtinComponents({ icons })`. Plain strings, so the Payload config loads no React.
   */
  icons?: readonly string[]
}

/**
 * The opt-in built-in blocks. Add them next to `defaultBlocks()`:
 * `[...defaultBlocks(), ...builtinBlocks({ include: ['carousel'] })]`. To replace one with your
 * own block of the same type, leave it out of `include`.
 */
export function builtinBlocks(options: BuiltinBlocksOptions = {}): BlockDefinition[] {
  const icons = options.icons ?? []
  const include = new Set<string>(options.include ?? BUILTIN_TYPES.filter((type) => type !== 'icon' || icons.length > 0))
  for (const type of include) {
    if (!(BUILTIN_TYPES as readonly string[]).includes(type)) throw new Error(`builtinBlocks: there is no built-in block "${type}".`)
  }
  if (include.has('icon') && icons.length === 0) {
    throw new Error('builtinBlocks: the "icon" block needs `icons`, the names of your icon set.')
  }
  const make: Record<BuiltinType, () => BlockDefinition[]> = {
    icon: () => [iconBlock(icons)],
    disclosure: () => [disclosureBlock()],
    accordion: () => [accordionBlock()],
    popup: () => [popupBlock()],
    tabs: () => [tabsBlock(), tabBlock()],
    carousel: () => [carouselBlock()],
    marquee: () => [marqueeBlock()],
    tableOfContents: () => [tableOfContentsBlock()],
    filterLink: () => [filterLinkBlock()],
    adjacentLinks: () => [adjacentLinksBlock()],
  }
  return BUILTIN_TYPES.filter((type) => include.has(type)).flatMap((type) => make[type]())
}

export { ADJACENT_LINKS_BLOCK, ADJACENT_LINKS_LABELS, adjacentLinksBlock } from './adjacentLinks'
export { CAROUSEL_BLOCK, CAROUSEL_CLASS_MAP, CAROUSEL_LABELS, carouselBlock } from './carousel'
export { ACCORDION_BLOCK, accordionBlock, DISCLOSURE_BLOCK, DISCLOSURE_CLASS_MAP, disclosureBlock } from './disclosure'
export { FILTER_LINK_BLOCK, filterHref, filterLinkBlock, type FilterLinkTarget, type FilterQuery } from './filterLink'
export { faqItems, faqJsonLd, type FaqItem } from './faq'
export { ICON_BLOCK, iconBlock } from './icon'
export { MARQUEE_BLOCK, MARQUEE_CSS, MARQUEE_SECONDS, marqueeBlock } from './marquee'
export { POPUP_BLOCK, POPUP_CLASS_MAP, POPUP_LABELS, popupBlock } from './popup'
export { SECTION_REF_BLOCK, SECTION_REF_MISSING, SECTION_REF_SLOT, SECTION_REF_VALUES, sectionDetachOps, sectionRefBlock, sectionRefBlocks, sectionRefId } from './sectionRef'
export { TABLE_OF_CONTENTS_BLOCK, TABLE_OF_CONTENTS_LABELS, tableOfContentsBlock } from './tableOfContents'
export { TAB_BLOCK, tabBlock, TABS_BLOCK, TABS_CLASS_MAP, TABS_LABELS, tabsBlock } from './tabs'
