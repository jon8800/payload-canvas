// Client-safe entry: `payload-canvas/blocks`. Block definitions are plain data, so the
// site, the canvas iframe and payload.config.ts can all import the same blocks list.
// No `node:` imports and no Payload runtime imports here (type imports only). A test checks it.

export { defaultBlocks, FIELD_CLASS_MAP, MENU_CLASS_MAP, MENU_LABELS, type DefaultBlocksOptions } from './defaults'
export * from './builtins'
export { isLinkField, linkField, type BuilderCondition, type LinkFieldOptions } from './link'
export { BLOCK_KEY_MARKER, fromPayloadBlocks, type FromPayloadBlocksOptions, type PayloadBlockOverride } from './payload'
export { defineBlock, defineSection, type SectionBlockInput, type SectionInput, sectionsWithVariants, withDefaultClassNames, withInlineBlocks } from '../core/blocks'
export { BUILDER_CSS_CLASS, withBuilderCssClass } from '../css/marker'
// Public since 0.4.0. 0.5.0 dropped this line by mistake; `exports.test.ts` keeps it.
export { listCollectionsOf, prepareBlocks } from '../plugin/listCollections'
export type {
  Block,
  BlockDefinition,
  BlockProps,
  Layout,
  SectionDefinition,
  SectionVariant,
  SlotDefinition,
} from '../core/types'
