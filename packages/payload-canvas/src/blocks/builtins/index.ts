// Opt-in built-in blocks: `builtinBlocks()` from `payload-canvas/blocks`. Client-safe, like the
// default blocks: plain data, no React. The components come from `builtinComponents()` in
// `payload-canvas/react`. The live saved section block (`sectionRef`) is not one of them: the
// plugin adds it when saved sections are on.

import type { BlockDefinition } from '../../core/types'
import { carouselBlock } from './carousel'
import { accordionBlock, disclosureBlock } from './disclosure'
import { filterLinkBlock } from './filterLink'
import { iconBlock } from './icon'
import { imageViewerBlock } from './imageViewer'
import { mediaBackdropBlock } from './mediaBackdrop'
import { tableOfContentsBlock } from './tableOfContents'

export const BUILTIN_TYPES = ['icon', 'disclosure', 'accordion', 'imageViewer', 'carousel', 'tableOfContents', 'filterLink', 'mediaBackdrop'] as const

export type BuiltinType = (typeof BUILTIN_TYPES)[number]

export type BuiltinBlocksOptions = {
  /** The built-ins to add. Default: all of them, but `icon` only when `icons` is given. */
  include?: readonly BuiltinType[]
  /**
   * The names of the site's icons, for the `icon` block: the keys of the map the site gives
   * `builtinComponents({ icons })`. Plain strings, so the Payload config loads no React.
   */
  icons?: readonly string[]
  /** Upload collection for the mediaBackdrop block. Default "media". */
  mediaCollection?: string
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
  const make: Record<BuiltinType, () => BlockDefinition> = {
    icon: () => iconBlock(icons),
    disclosure: disclosureBlock,
    accordion: accordionBlock,
    imageViewer: imageViewerBlock,
    carousel: carouselBlock,
    tableOfContents: tableOfContentsBlock,
    filterLink: filterLinkBlock,
    mediaBackdrop: () => mediaBackdropBlock(options.mediaCollection),
  }
  return BUILTIN_TYPES.filter((type) => include.has(type)).map((type) => make[type]())
}

export { CAROUSEL_BLOCK, CAROUSEL_CLASS_MAP, CAROUSEL_LABELS, carouselBlock } from './carousel'
export { ACCORDION_BLOCK, accordionBlock, DISCLOSURE_BLOCK, DISCLOSURE_CLASS_MAP, disclosureBlock } from './disclosure'
export { FILTER_LINK_BLOCK, filterHref, filterLinkBlock, type FilterLinkTarget, type FilterQuery } from './filterLink'
export { faqItems, faqJsonLd, type FaqItem } from './faq'
export { ICON_BLOCK, iconBlock } from './icon'
export { IMAGE_VIEWER_BLOCK, IMAGE_VIEWER_CLASS_MAP, IMAGE_VIEWER_LABELS, imageViewerBlock } from './imageViewer'
export { MEDIA_BACKDROP_BLOCK, MEDIA_BACKDROP_CLASS_MAP, mediaBackdropBlock } from './mediaBackdrop'
export { SECTION_REF_BLOCK, SECTION_REF_SLOT, sectionDetachOps, sectionRefBlock, sectionRefBlocks, sectionRefId } from './sectionRef'
export { TABLE_OF_CONTENTS_BLOCK, TABLE_OF_CONTENTS_LABELS, tableOfContentsBlock } from './tableOfContents'
