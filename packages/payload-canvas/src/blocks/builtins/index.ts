// Opt-in built-in blocks: `builtinBlocks()` from `payload-canvas/blocks`. Client-safe, like the
// default blocks: plain data, no React. The components come from `builtinComponents()` in
// `payload-canvas/react`.

import type { BlockDefinition } from '../../core/types'
import { carouselBlock } from './carousel'
import { accordionBlock, disclosureBlock } from './disclosure'
import { filterLinkBlock } from './filterLink'
import { iconBlock } from './icon'
import { lightboxBlock } from './lightbox'
import { mediaBackdropBlock } from './mediaBackdrop'
import { sectionRefBlock } from './sectionRef'
import { tableOfContentsBlock } from './tableOfContents'

export const BUILTIN_TYPES = ['icon', 'disclosure', 'accordion', 'lightbox', 'carousel', 'tableOfContents', 'filterLink', 'mediaBackdrop', 'sectionRef'] as const

export type BuiltinType = (typeof BUILTIN_TYPES)[number]

export type BuiltinBlocksOptions = {
  /**
   * The built-ins to add. Default: all of them, but `icon` only when `icons` is given and
   * `sectionRef` only when listed here (it needs the plugin's saved sections).
   */
  include?: readonly BuiltinType[]
  /**
   * The names of the site's icons, for the `icon` block: the keys of the map the site gives
   * `builtinComponents({ icons })`. Plain strings, so the Payload config loads no React.
   */
  icons?: readonly string[]
  /** Upload collection for the mediaBackdrop block. Default "media". */
  mediaCollection?: string
  /** The saved sections collection, for the sectionRef block. Default "builder-sections" (`websiteBuilder({ savedSections: { slug } })`). */
  sectionsCollection?: string
}

/**
 * The opt-in built-in blocks. Add them next to `defaultBlocks()`:
 * `[...defaultBlocks(), ...builtinBlocks({ include: ['carousel'] })]`. To replace one with your
 * own block of the same type, leave it out of `include`.
 */
export function builtinBlocks(options: BuiltinBlocksOptions = {}): BlockDefinition[] {
  const icons = options.icons ?? []
  const include = new Set<string>(options.include ?? BUILTIN_TYPES.filter((type) => type !== 'sectionRef' && (type !== 'icon' || icons.length > 0)))
  for (const type of include) {
    if (!(BUILTIN_TYPES as readonly string[]).includes(type)) throw new Error(`builtinBlocks: there is no built-in block "${type}".`)
  }
  if (include.has('icon') && icons.length === 0) {
    throw new Error('builtinBlocks: the "icon" block needs `icons`, the names of your icon set.')
  }
  const make: Record<BuiltinType, () => BlockDefinition> = {
    icon: () => iconBlock(icons),
    disclosure: disclosureBlock,
    accordion: accordionBlock,
    lightbox: lightboxBlock,
    carousel: carouselBlock,
    tableOfContents: tableOfContentsBlock,
    filterLink: filterLinkBlock,
    mediaBackdrop: () => mediaBackdropBlock(options.mediaCollection),
    sectionRef: () => sectionRefBlock(options.sectionsCollection),
  }
  return BUILTIN_TYPES.filter((type) => include.has(type)).map((type) => make[type]())
}

export { CAROUSEL_BLOCK, CAROUSEL_CLASS_MAP, carouselBlock } from './carousel'
export { ACCORDION_BLOCK, accordionBlock, DISCLOSURE_BLOCK, DISCLOSURE_CLASS_MAP, disclosureBlock } from './disclosure'
export { FILTER_LINK_BLOCK, filterHref, filterLinkBlock, type FilterLinkTarget, type FilterQuery } from './filterLink'
export { faqItems, faqJsonLd, type FaqItem } from './faq'
export { headingId, lexicalHeadings, lexicalText, type RichTextHeading } from './headingId'
export { ICON_BLOCK, iconBlock } from './icon'
export { LIGHTBOX_BLOCK, LIGHTBOX_CLASS_MAP, LIGHTBOX_CLOSE_EVENT, LIGHTBOX_SKIP_ATTRIBUTE, lightboxBlock } from './lightbox'
export { MEDIA_BACKDROP_BLOCK, MEDIA_BACKDROP_CLASS_MAP, mediaBackdropBlock } from './mediaBackdrop'
export { SECTION_REF_BLOCK, SECTION_REF_SLOT, sectionDetachOps, sectionRefBlock, sectionRefBlocks, sectionRefId } from './sectionRef'
export { TABLE_OF_CONTENTS_BLOCK, tableOfContentsBlock } from './tableOfContents'
