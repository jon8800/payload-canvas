// Opt-in built-in blocks: `builtinBlocks()` from `payload-canvas/blocks`. Client-safe, like the
// default blocks: plain data, no React. The components come from `builtinComponents()` in
// `payload-canvas/react`.

import type { BlockDefinition } from '../../core/types'
import { accordionBlock, disclosureBlock } from './disclosure'
import { iconBlock } from './icon'
import { lightboxBlock } from './lightbox'

export const BUILTIN_TYPES = ['icon', 'disclosure', 'accordion', 'lightbox'] as const

export type BuiltinType = (typeof BUILTIN_TYPES)[number]

export type BuiltinBlocksOptions = {
  /** The built-ins to add. Default: all of them (`icon` only when `icons` is given). */
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
  const make: Record<BuiltinType, () => BlockDefinition> = {
    icon: () => iconBlock(icons),
    disclosure: disclosureBlock,
    accordion: accordionBlock,
    lightbox: lightboxBlock,
  }
  return BUILTIN_TYPES.filter((type) => include.has(type)).map((type) => make[type]())
}

export { ACCORDION_BLOCK, accordionBlock, DISCLOSURE_BLOCK, DISCLOSURE_CLASS_MAP, disclosureBlock } from './disclosure'
export { faqItems, faqJsonLd, type FaqItem } from './faq'
export { ICON_BLOCK, iconBlock } from './icon'
export { LIGHTBOX_BLOCK, LIGHTBOX_CLASS_MAP, lightboxBlock } from './lightbox'
